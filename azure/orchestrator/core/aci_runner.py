import os
import time
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from azure.identity import DefaultAzureCredential
from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.containerinstance.models import (  # type: ignore
    Container,
    ContainerGroup,
    ContainerPort,
    EnvironmentVariable,
    ImageRegistryCredential,
    IpAddress,
    OperatingSystemTypes,
    Port,
    ResourceRequests,
    ResourceRequirements,
)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class AciConfig:
    subscription_id: str
    resource_group: str
    location: str
    container_group_name: str
    container_name: str
    image: str
    cpu: float
    memory_gb: float
    acr_login_server: Optional[str]
    acr_username: Optional[str]
    acr_password: Optional[str]
    poll_seconds: float
    container_port: int
    environment_variables: dict


def get_aci_config_from_env() -> AciConfig:
    # Auth (DefaultAzureCredential will pick these up)
    subscription_id = os.getenv("AZURE_SUBSCRIPTION_ID") or ""
    if not subscription_id:
        raise RuntimeError("Missing AZURE_SUBSCRIPTION_ID")

    resource_group = os.getenv("AZURE_RESOURCE_GROUP") or ""
    if not resource_group:
        raise RuntimeError("Missing AZURE_RESOURCE_GROUP")

    location = os.getenv("AZURE_LOCATION") or ""
    if not location:
        raise RuntimeError("Missing AZURE_LOCATION (example: eastus)")

    image = os.getenv("ACI_IMAGE") or ""
    if not image:
        raise RuntimeError(
            "Missing ACI_IMAGE (example: <ACR_LOGIN_SERVER>/<repo>:<tag> or public image)."
        )

    cg_name = os.getenv("ACI_CONTAINER_GROUP_NAME") or f"cloudops-{int(time.time())}"
    container_name = os.getenv("ACI_CONTAINER_NAME") or "task"

    cpu = float(os.getenv("ACI_CPU") or "1")
    memory_gb = float(os.getenv("ACI_MEMORY_GB") or "1.5")

    acr_login_server = os.getenv("ACR_LOGIN_SERVER")
    acr_username = os.getenv("ACR_USERNAME")
    acr_password = os.getenv("ACR_PASSWORD")

    poll_seconds = float(os.getenv("ACI_POLL_SECONDS") or "5")
    container_port = int(os.getenv("ACI_PORT") or os.getenv("PORT") or "80")

    # Parse environment variables JSON if passed
    import json
    raw_env = os.getenv("ACI_ENV_JSON") or "{}"
    try:
        env_dict = json.loads(raw_env)
    except Exception:
        env_dict = {}

    return AciConfig(
        subscription_id=subscription_id,
        resource_group=resource_group,
        location=location,
        container_group_name=cg_name,
        container_name=container_name,
        image=image,
        cpu=cpu,
        memory_gb=memory_gb,
        acr_login_server=acr_login_server,
        acr_username=acr_username,
        acr_password=acr_password,
        poll_seconds=poll_seconds,
        container_port=container_port,
        environment_variables=env_dict,
    )


def _build_registry_credentials(cfg: AciConfig):
    # Cost/guardrail: only attach registry credentials if provided.
    # If image is public OR the user configured identity-based pull, this can be omitted.
    if not cfg.acr_login_server:
        return None
    if cfg.acr_username and cfg.acr_password:
        return [ImageRegistryCredential(server=cfg.acr_login_server, username=cfg.acr_username, password=cfg.acr_password)]
    return None


def create_container_group(client: ContainerInstanceManagementClient, cfg: AciConfig) -> None:
    aci_env_vars = []
    # Always supply PORT matching the exposed container_port so Node/Express listens on it
    merged_env = {**cfg.environment_variables, "PORT": str(cfg.container_port)}
    for k, v in merged_env.items():
        if v is not None:
            aci_env_vars.append(EnvironmentVariable(name=str(k), value=str(v)))

    container = Container(
        name=cfg.container_name,
        image=cfg.image,
        resources=ResourceRequirements(
            requests=ResourceRequests(cpu=cfg.cpu, memory_in_gb=cfg.memory_gb)
        ),
        ports=[ContainerPort(port=cfg.container_port)],
        environment_variables=aci_env_vars,
    )

    group = ContainerGroup(
        location=cfg.location,
        os_type=OperatingSystemTypes.linux,
        restart_policy="Always",
        containers=[container],
        image_registry_credentials=_build_registry_credentials(cfg),
        ip_address=IpAddress(ports=[Port(port=cfg.container_port, protocol="TCP")], dns_name_label=cfg.container_group_name, type="Public"),
    )

    poller = client.container_groups.begin_create_or_update(
        cfg.resource_group, cfg.container_group_name, group
    )
    poller.result()

    poller = client.container_groups.begin_create_or_update(
        cfg.resource_group, cfg.container_group_name, group
    )
    poller.result()


def _get_container_state(client: ContainerInstanceManagementClient, cfg: AciConfig) -> str:
    group = client.container_groups.get(cfg.resource_group, cfg.container_group_name)
    instance = None
    if group.containers:
        instance = group.containers[0].instance_view if hasattr(group.containers[0], "instance_view") else None

    # Prefer container's current_state if available
    if instance and getattr(instance, "current_state", None) and getattr(instance.current_state, "state", None):
        return str(instance.current_state.state)

    # Fallback to group provisioning_state
    if getattr(group, "provisioning_state", None):
        return str(group.provisioning_state)

    return "Unknown"


def _get_container_exit_code(client: ContainerInstanceManagementClient, cfg: AciConfig) -> Optional[int]:
    group = client.container_groups.get(cfg.resource_group, cfg.container_group_name)
    if not group.containers:
        return None
    view = getattr(group.containers[0], "instance_view", None)
    state = getattr(view, "current_state", None) if view else None
    return getattr(state, "exit_code", None) if state else None


def _append_logs(client: ContainerInstanceManagementClient, cfg: AciConfig, *, out_path: str) -> None:
    # list_logs returns current log content; to keep it simple & low-call-rate, we overwrite the file each time.
    # (We still keep polling intervals low to avoid API waste.)
    logs = client.containers.list_logs(
        cfg.resource_group, cfg.container_group_name, cfg.container_name
    )
    content = getattr(logs, "content", "") or ""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
        if content and not content.endswith("\n"):
            f.write("\n")


def _save_logs_locally(cfg: AciConfig, *, source_path: str) -> str:
    base_dir = os.path.abspath(os.path.join(os.getcwd(), "debug_logs"))
    os.makedirs(base_dir, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    deploy_id = cfg.container_group_name.split("-")[-1] if "-" in cfg.container_group_name else cfg.container_group_name
    target_name = f"deploy_{deploy_id}_{timestamp}.log"
    target_path = os.path.join(base_dir, target_name)

    with open(source_path, "r", encoding="utf-8") as src, open(target_path, "w", encoding="utf-8") as dst:
        dst.write(src.read())

    return target_path


def run_aci_task() -> int:
    """
    Persistent ACI runner:
    - Creates a container group (restartPolicy=Always) that runs continuously
    - Polls status until running
    - Captures logs into a temp file
    - Uploads logs to Blob Storage
    - Returns public IP address for live access
    - Does NOT delete the container (keeps it running)
    """
    cfg = get_aci_config_from_env()
    created = False

    # temp log file cleaned up in finally
    tmp_dir = tempfile.mkdtemp(prefix="aci-logs-")
    log_path = os.path.join(tmp_dir, "container.log.txt")

    credential = DefaultAzureCredential()
    aci_client = ContainerInstanceManagementClient(credential, cfg.subscription_id)

    exit_code: Optional[int] = None

    try:
        print(f"[{_utc_iso()}] creating container group: {cfg.container_group_name}", flush=True)
        create_container_group(aci_client, cfg)
        created = True

        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"[{_utc_iso()}] created container group: {cfg.container_group_name}\n")

        # Monitor until running state (container should keep running with restartPolicy=Always).
        max_wait_attempts = 60  # Wait up to 5 minutes for container to start
        attempt = 0
        while attempt < max_wait_attempts:
            state = _get_container_state(aci_client, cfg)
            print(f"[{_utc_iso()}] container state: {state}", flush=True)
            try:
                _append_logs(aci_client, cfg, out_path=log_path)
            except Exception:
                # If log retrieval fails transiently, continue polling state.
                pass

            if state == "Running":
                print(f"[{_utc_iso()}] container is now running", flush=True)
                break
            if state in {"Failed", "Stopped", "Terminated"}:
                raise RuntimeError(f"Container failed to start. State: {state}")
            time.sleep(cfg.poll_seconds)
            attempt += 1

        if attempt >= max_wait_attempts:
            raise RuntimeError(f"Container did not reach Running state within {max_wait_attempts * cfg.poll_seconds} seconds")

        try:
            _append_logs(aci_client, cfg, out_path=log_path)
        except Exception:
            pass

        # Get public IP for live access
        group = aci_client.container_groups.get(cfg.resource_group, cfg.container_group_name)
        public_ip = getattr(group.ip_address, 'ip', None) if group.ip_address else None
        fqdn = getattr(group.ip_address, 'fqdn', None) if group.ip_address else None
        
        print(f"[{_utc_iso()}] public IP: {public_ip}", flush=True)
        print(f"[{_utc_iso()}] FQDN: {fqdn}", flush=True)
        port_suffix = f":{cfg.container_port}" if cfg.container_port != 80 else ""
        print(f"[{_utc_iso()}] access URL: http://{fqdn}{port_suffix} or http://{public_ip}{port_suffix}", flush=True)
        
        # Store access info in environment for backend to retrieve
        os.environ["CONTAINER_PUBLIC_IP"] = public_ip or ""
        os.environ["CONTAINER_FQDN"] = fqdn or ""

        local_log_path = _save_logs_locally(cfg, source_path=log_path)
        print(f"[{_utc_iso()}] logs saved locally: {local_log_path}", flush=True)
        return 0
    finally:
        # Keep container running (do NOT delete)
        print(f"[{_utc_iso()}] container group will remain running: {cfg.container_group_name}", flush=True)
        try:
            credential.close()
        except Exception:
            pass
        try:
            if os.path.exists(log_path):
                os.remove(log_path)
            if os.path.isdir(tmp_dir):
                os.rmdir(tmp_dir)
        except OSError:
            pass

