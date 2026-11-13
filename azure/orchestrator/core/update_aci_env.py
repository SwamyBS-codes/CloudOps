import argparse
import json
import os
import sys

from azure.identity import DefaultAzureCredential
from azure.mgmt.containerinstance import ContainerInstanceManagementClient
from azure.mgmt.containerinstance.models import (
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


def main():
    parser = argparse.ArgumentParser(description="Update running Azure Container Instance environment variables and port.")
    parser.add_argument("--subscription-id", required=True)
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--group-name", required=True)
    parser.add_argument("--env-json", default="{}")
    parser.add_argument("--port", type=int, default=80)
    args = parser.parse_args()

    credential = DefaultAzureCredential()
    client = ContainerInstanceManagementClient(credential, args.subscription_id)

    try:
        existing_group = client.container_groups.get(args.resource_group, args.group_name)
    except Exception as e:
        print(f"Error finding container group {args.group_name}: {e}", file=sys.stderr)
        return 1

    try:
        new_env = json.loads(args.env_json)
    except Exception:
        new_env = {}

    if "PORT" in new_env and str(new_env["PORT"]).isdigit():
        target_port = int(new_env["PORT"])
    else:
        target_port = args.port or 80
        new_env["PORT"] = str(target_port)

    # Format environment variables
    env_vars = [EnvironmentVariable(name=str(k), value=str(v)) for k, v in new_env.items() if v is not None]

    old_container = existing_group.containers[0]
    container = Container(
        name=old_container.name,
        image=old_container.image,
        resources=old_container.resources,
        ports=[ContainerPort(port=target_port)],
        environment_variables=env_vars,
    )

    new_group = ContainerGroup(
        location=existing_group.location,
        os_type=OperatingSystemTypes.linux,
        restart_policy="Always",
        containers=[container],
        image_registry_credentials=existing_group.image_registry_credentials,
        ip_address=IpAddress(
            ports=[Port(port=target_port, protocol="TCP")],
            dns_name_label=existing_group.ip_address.dns_name_label if existing_group.ip_address else args.group_name,
            type="Public",
        ),
    )

    print(f"Applying updated configuration to {args.group_name} on port {target_port}...", flush=True)
    poller = client.container_groups.begin_create_or_update(
        args.resource_group, args.group_name, new_group
    )
    poller.result()
    print("SUCCESS: Container updated and restarted with new configuration.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
