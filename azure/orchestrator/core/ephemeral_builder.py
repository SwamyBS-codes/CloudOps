import argparse
import base64
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

from azure.identity import DefaultAzureCredential
from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.containerinstance.models import (
    Container,
    ContainerGroup,
    EnvironmentVariable,
    ImageRegistryCredential,
    OperatingSystemTypes,
    ResourceRequests,
    ResourceRequirements,
)
from dotenv import load_dotenv


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_ephemeral_build(
    context_url: str,
    destination: str,
    builder_group_name: str,
    acr_server: Optional[str] = None,
    acr_username: Optional[str] = None,
    acr_password: Optional[str] = None,
    subscription_id: Optional[str] = None,
    resource_group: Optional[str] = None,
    location: Optional[str] = None,
    cpu: float = 1.0,
    memory_gb: float = 1.5,
    timeout_seconds: int = 600,
) -> int:
    load_dotenv(override=False)

    sub_id = subscription_id or os.getenv("AZURE_SUBSCRIPTION_ID")
    rg = resource_group or os.getenv("AZURE_RESOURCE_GROUP")
    loc = location or os.getenv("AZURE_LOCATION")

    server = acr_server or os.getenv("ACR_LOGIN_SERVER") or "cloudopsre1.azurecr.io"
    user = acr_username or os.getenv("ACR_USERNAME")
    pwd = acr_password or os.getenv("ACR_PASSWORD")

    if not sub_id or not rg or not loc:
        print("[Ephemeral Builder] Missing required Azure subscription, resource group, or location.", file=sys.stderr)
        return 1

    if not user or not pwd:
        print("[Ephemeral Builder] Missing ACR credentials for pushing image.", file=sys.stderr)
        return 1

    auth_str = f"{user}:{pwd}"
    auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

    print(f"[{_utc_iso()}] [Ephemeral Builder] Initializing Azure Container Instance builder...", flush=True)
    print(f"[{_utc_iso()}] [Ephemeral Builder] Target Image: {destination}", flush=True)
    print(f"[{_utc_iso()}] [Ephemeral Builder] Resource Group: {rg} ({loc})", flush=True)
    print(f"[{_utc_iso()}] [Ephemeral Builder] Builder Group: {builder_group_name}", flush=True)

    cred = DefaultAzureCredential()
    client = ContainerInstanceManagementClient(cred, sub_id)

    # Shell script executed inside Kaniko debug image (uses busybox sh)
    # 1. Configures Docker auth for destination ACR
    # 2. Downloads tarball directly using wget from Blob SAS URL
    # 3. Unpacks repository context and auto-generates Dockerfile if missing
    # 4. Runs Kaniko executor on /workspace/src and pushes directly to ACR
    build_script = (
        'set -e\n'
        'mkdir -p /kaniko/.docker /root/.docker /workspace/src\n'
        'export DOCKER_CONFIG=/kaniko/.docker\n'
        f'echo \'{{"auths":{{"{server}":{{"auth":"{auth_b64}"}}}}}}\' > /kaniko/.docker/config.json\n'
        'cp /kaniko/.docker/config.json /root/.docker/config.json\n'
        'echo "[Kaniko] Auth configured for registry."\n'
        'echo "[Kaniko] Downloading context tarball from Azure Blob Storage..."\n'
        f'curl -fsSL -o /workspace/context.tar.gz "{context_url}"\n'
        'echo "[Kaniko] Unpacking repository archive..."\n'
        'tar -xzf /workspace/context.tar.gz -C /workspace/src --strip-components=1\n'
        'rm -f /workspace/context.tar.gz\n'
        'if [ ! -f /workspace/src/Dockerfile ]; then\n'
        '  echo "[Kaniko] No Dockerfile detected. Generating container build instructions..."\n'
        '  PKG_PATH=$(find /workspace/src -maxdepth 3 -name package.json -not -path "*/node_modules/*" | head -n 1)\n'
        '  PY_PATH=$(find /workspace/src -maxdepth 3 \\( -name requirements.txt -o -name app.py -o -name main.py \\) -not -path "*/.*" | head -n 1)\n'
        '  if [ -n "$PKG_PATH" ]; then\n'
        '    REL_DIR=$(dirname "$PKG_PATH" | sed "s|^/workspace/src/*||")\n'
        '    CP_PREFIX=""\n'
        '    if [ -n "$REL_DIR" ] && [ "$REL_DIR" != "." ]; then CP_PREFIX="${REL_DIR}/"; fi\n'
        '    echo "FROM node:20-alpine" > /workspace/src/Dockerfile\n'
        '    echo "WORKDIR /app" >> /workspace/src/Dockerfile\n'
        '    echo "COPY ${CP_PREFIX}package*.json ./" >> /workspace/src/Dockerfile\n'
        '    echo "RUN npm install --production || npm install" >> /workspace/src/Dockerfile\n'
        '    echo "COPY ${CP_PREFIX}. ." >> /workspace/src/Dockerfile\n'
        '    echo "EXPOSE 3000" >> /workspace/src/Dockerfile\n'
        '    echo \'CMD ["npm", "start"]\' >> /workspace/src/Dockerfile\n'
        '  elif [ -n "$PY_PATH" ]; then\n'
        '    REL_DIR=$(dirname "$PY_PATH" | sed "s|^/workspace/src/*||")\n'
        '    CP_PREFIX=""\n'
        '    if [ -n "$REL_DIR" ] && [ "$REL_DIR" != "." ]; then CP_PREFIX="${REL_DIR}/"; fi\n'
        '    echo "FROM python:3.12-alpine" > /workspace/src/Dockerfile\n'
        '    echo "WORKDIR /app" >> /workspace/src/Dockerfile\n'
        '    echo "COPY ${CP_PREFIX}. ." >> /workspace/src/Dockerfile\n'
        '    echo "RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi" >> /workspace/src/Dockerfile\n'
        '    echo \'CMD ["sh", "-c", "if [ -f app.py ]; then python app.py; elif [ -f main.py ]; then python main.py; else exit 1; fi"]\' >> /workspace/src/Dockerfile\n'
        '  else\n'
        '    echo "FROM alpine:3.20" > /workspace/src/Dockerfile\n'
        '    echo "WORKDIR /workspace" >> /workspace/src/Dockerfile\n'
        '    echo "COPY . ." >> /workspace/src/Dockerfile\n'
        '    echo \'CMD ["sh", "-c", "echo No runnable framework detected; exit 1"]\' >> /workspace/src/Dockerfile\n'
        '  fi\n'
        'fi\n'
        'echo "[Kaniko] Compiling image and pushing directly to ACR registry..."\n'
        f'/kaniko/executor --context=/workspace/src --destination="{destination}" --cache=false --compressed-caching=false\n'
        'echo "[Kaniko] Image build and push completed successfully!"\n'
    )

    container_name = "builder"
    builder_image = f"{server}/kaniko-builder:latest"
    registry_creds = [ImageRegistryCredential(server=server, username=user, password=pwd)] if user and pwd else None

    container = Container(
        name=container_name,
        image=builder_image,
        command=["/bin/sh", "-c", build_script],
        resources=ResourceRequirements(
            requests=ResourceRequests(cpu=cpu, memory_in_gb=memory_gb)
        ),
    )

    group = ContainerGroup(
        location=loc,
        os_type=OperatingSystemTypes.linux,
        restart_policy="Never",
        containers=[container],
        image_registry_credentials=registry_creds,
    )

    group_created = False
    try:
        print(f"[{_utc_iso()}] [Ephemeral Builder] Provisioning isolated builder container in ACI...", flush=True)
        create_poller = client.container_groups.begin_create_or_update(rg, builder_group_name, group)
        create_poller.result()
        group_created = True
        print(f"[{_utc_iso()}] [Ephemeral Builder] Builder container running. Streaming build logs...", flush=True)

        start_time = time.time()
        last_log_offset = 0

        while True:
            if time.time() - start_time > timeout_seconds:
                print(f"[{_utc_iso()}] [Ephemeral Builder] Build timed out after {timeout_seconds}s.", flush=True)
                return 1

            # Check container status
            try:
                cg = client.container_groups.get(rg, builder_group_name)
            except Exception as e:
                print(f"[Ephemeral Builder] Error querying container group: {e}", flush=True)
                time.sleep(3)
                continue

            # Stream logs
            try:
                log_res = client.containers.list_logs(rg, builder_group_name, container_name)
                content = getattr(log_res, "content", "") or ""
                if len(content) > last_log_offset:
                    new_logs = content[last_log_offset:]
                    for line in new_logs.splitlines():
                        print(f"[Build] {line}", flush=True)
                    last_log_offset = len(content)
            except Exception:
                pass

            # Inspect instance view for exit status
            inst_view = None
            if cg.containers:
                inst_view = getattr(cg.containers[0], "instance_view", None)

            current_state = getattr(inst_view, "current_state", None) if inst_view else None
            state_name = getattr(current_state, "state", None) if current_state else None
            exit_code = getattr(current_state, "exit_code", None) if current_state else None

            provisioning_state = getattr(cg, "provisioning_state", "")

            if state_name in ("Terminated", "Succeeded", "Failed") or exit_code is not None:
                # Flush any remaining logs
                try:
                    log_res = client.containers.list_logs(rg, builder_group_name, container_name)
                    content = getattr(log_res, "content", "") or ""
                    if len(content) > last_log_offset:
                        new_logs = content[last_log_offset:]
                        for line in new_logs.splitlines():
                            print(f"[Build] {line}", flush=True)
                except Exception:
                    pass

                code = exit_code if exit_code is not None else (0 if state_name == "Succeeded" else 1)
                if code == 0:
                    print(f"[{_utc_iso()}] [Ephemeral Builder] SUCCESS: Image pushed to {destination}", flush=True)
                    return 0
                else:
                    print(f"[{_utc_iso()}] [Ephemeral Builder] FAILED: Builder exited with code {code}", flush=True)
                    return code

            if provisioning_state in ("Failed", "Canceled"):
                print(f"[{_utc_iso()}] [Ephemeral Builder] Container group provisioning failed ({provisioning_state})", flush=True)
                return 1

            time.sleep(4)

    finally:
        if group_created:
            print(f"[{_utc_iso()}] [Ephemeral Builder] Terminating builder container to stop compute billing...", flush=True)
            try:
                del_poller = client.container_groups.begin_delete(rg, builder_group_name)
                del_poller.result()
                print(f"[{_utc_iso()}] [Ephemeral Builder] Builder container group deleted. Billing stopped ($0/hr).", flush=True)
            except Exception as del_err:
                print(f"[Ephemeral Builder] Notice: failed to delete builder group: {del_err}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run zero-disk ephemeral ACI build with Kaniko.")
    parser.add_argument("--context-url", required=True, help="Azure Blob SAS URL of the source tarball.")
    parser.add_argument("--destination", required=True, help="Target image destination (e.g. acr.azurecr.io/app:tag).")
    parser.add_argument("--builder-group", required=True, help="Unique name for the builder container group.")
    parser.add_argument("--acr-server", help="ACR login server.")
    parser.add_argument("--acr-username", help="ACR username.")
    parser.add_argument("--acr-password", help="ACR password.")
    parser.add_argument("--subscription-id", help="Azure subscription id.")
    parser.add_argument("--resource-group", help="Azure resource group.")
    parser.add_argument("--location", help="Azure region/location.")
    parser.add_argument("--cpu", type=float, default=1.0, help="Builder CPU cores.")
    parser.add_argument("--memory-gb", type=float, default=1.5, help="Builder Memory in GB.")
    parser.add_argument("--timeout", type=int, default=600, help="Build timeout in seconds.")
    args = parser.parse_args()

    return run_ephemeral_build(
        context_url=args.context_url,
        destination=args.destination,
        builder_group_name=args.builder_group,
        acr_server=args.acr_server,
        acr_username=args.acr_username,
        acr_password=args.acr_password,
        subscription_id=args.subscription_id,
        resource_group=args.resource_group,
        location=args.location,
        cpu=args.cpu,
        memory_gb=args.memory_gb,
        timeout_seconds=args.timeout,
    )


if __name__ == "__main__":
    raise SystemExit(main())
