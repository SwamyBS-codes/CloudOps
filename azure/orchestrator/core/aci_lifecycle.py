import argparse
import json
import os
import sys

from azure.identity import DefaultAzureCredential
from azure.mgmt.containerinstance import ContainerInstanceManagementClient


def main():
    parser = argparse.ArgumentParser(description="Manage Azure Container Instance lifecycle (stop, start, restart, delete, status).")
    parser.add_argument("--action", required=True, choices=["stop", "start", "restart", "delete", "status"])
    parser.add_argument("--subscription-id", required=True)
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--group-name", required=True)
    args = parser.parse_args()

    credential = DefaultAzureCredential()
    client = ContainerInstanceManagementClient(credential, args.subscription_id)

    try:
        if args.action == "stop":
            client.container_groups.stop(args.resource_group, args.group_name)
            result = {"action": "stop", "status": "stopped", "group_name": args.group_name}
        elif args.action == "start":
            poller = client.container_groups.begin_start(args.resource_group, args.group_name)
            # We don't have to block indefinitely, but waiting a few seconds gives us confirmation
            result = {"action": "start", "status": "running", "group_name": args.group_name}
        elif args.action == "restart":
            poller = client.container_groups.begin_restart(args.resource_group, args.group_name)
            result = {"action": "restart", "status": "restarting", "group_name": args.group_name}
        elif args.action == "delete":
            poller = client.container_groups.begin_delete(args.resource_group, args.group_name)
            poller.result()
            result = {"action": "delete", "status": "deleted", "group_name": args.group_name}
        elif args.action == "status":
            cg = client.container_groups.get(args.resource_group, args.group_name)
            state = cg.instance_view.state if cg.instance_view else cg.provisioning_state
            ip = cg.ip_address.ip if cg.ip_address else None
            fqdn = cg.ip_address.fqdn if cg.ip_address else None
            result = {
                "action": "status",
                "group_name": args.group_name,
                "provisioning_state": cg.provisioning_state,
                "state": state,
                "ip": ip,
                "fqdn": fqdn,
            }
        else:
            print(f"Unknown action: {args.action}", file=sys.stderr)
            return 1

        print(json.dumps(result))
        return 0
    except Exception as e:
        err_msg = str(e)
        print(f"Error executing {args.action} on {args.group_name}: {err_msg}", file=sys.stderr)
        print(json.dumps({"error": err_msg, "action": args.action, "group_name": args.group_name}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
