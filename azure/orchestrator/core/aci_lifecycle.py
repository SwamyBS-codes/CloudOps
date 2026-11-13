import argparse
import json
import os
import sys

from azure.identity import DefaultAzureCredential
from azure.mgmt.containerinstance import ContainerInstanceManagementClient


def main():
    parser = argparse.ArgumentParser(description="Manage Azure Container Instance lifecycle (stop, start, restart, delete, status, logs).")
    parser.add_argument("--action", required=True, choices=["stop", "start", "restart", "delete", "status", "logs"])
    parser.add_argument("--subscription-id", required=True)
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--group-name", required=True)
    parser.add_argument("--tail", type=int, default=300)
    args = parser.parse_args()

    credential = DefaultAzureCredential()
    client = ContainerInstanceManagementClient(credential, args.subscription_id)

    try:
        if args.action == "stop":
            client.container_groups.stop(args.resource_group, args.group_name)
            result = {"action": "stop", "status": "stopped", "group_name": args.group_name}
        elif args.action == "start":
            poller = client.container_groups.begin_start(args.resource_group, args.group_name)
            poller.result()
            result = {"action": "start", "status": "running", "group_name": args.group_name}
        elif args.action == "restart":
            poller = client.container_groups.begin_restart(args.resource_group, args.group_name)
            poller.result()
            result = {"action": "restart", "status": "running", "group_name": args.group_name}
        elif args.action == "delete":
            poller = client.container_groups.begin_delete(args.resource_group, args.group_name)
            poller.result()
            result = {"action": "delete", "status": "deleted", "group_name": args.group_name}
        elif args.action == "status":
            cg = client.container_groups.get(args.resource_group, args.group_name)
            container = cg.containers[0] if (cg.containers and len(cg.containers) > 0) else None
            iv = container.instance_view if container else None
            container_state = iv.current_state.state if (iv and iv.current_state) else None
            detail_status = iv.current_state.detail_status if (iv and iv.current_state) else None
            state = container_state or (cg.instance_view.state if cg.instance_view else cg.provisioning_state)
            ip = cg.ip_address.ip if cg.ip_address else None
            fqdn = cg.ip_address.fqdn if cg.ip_address else None
            result = {
                "action": "status",
                "group_name": args.group_name,
                "provisioning_state": cg.provisioning_state,
                "state": state,
                "detail_status": detail_status,
                "restart_count": iv.restart_count if iv else 0,
                "ip": ip,
                "fqdn": fqdn,
            }
        elif args.action == "logs":
            cg = client.container_groups.get(args.resource_group, args.group_name)
            container_name = cg.containers[0].name if (cg.containers and len(cg.containers) > 0) else "task"
            content = ""
            try:
                logs_res = client.containers.list_logs(args.resource_group, args.group_name, container_name, tail=args.tail or 300, timestamps=True)
                content = logs_res.content if (logs_res and logs_res.content) else ""
            except Exception as le:
                content = f"[ACI] Container log note: {str(le)}"

            # Also include container state in log metadata if available
            container = cg.containers[0] if (cg.containers and len(cg.containers) > 0) else None
            iv = container.instance_view if container else None
            c_state = iv.current_state.state if (iv and iv.current_state) else None
            c_detail = iv.current_state.detail_status if (iv and iv.current_state) else None
            prev_state = iv.previous_state if iv else None

            result = {
                "action": "logs",
                "group_name": args.group_name,
                "container_name": container_name,
                "state": c_state,
                "detail_status": c_detail,
                "previous_state": str(prev_state) if prev_state else None,
                "content": content or "",
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
