import json
import os
from typing import Any, Dict, List

from azure.identity import DefaultAzureCredential
from azure.mgmt.advisor import AdvisorManagementClient
try:
    from azure.mgmt.resource import ResourceManagementClient
except ImportError:
    from azure.mgmt.resource.resources import ResourceManagementClient
from dotenv import load_dotenv


def _extract_resource_name(resource_id: str) -> str:
    if not resource_id:
        return "unknown-resource"
    parts = [part for part in resource_id.split("/") if part]
    if not parts:
        return "unknown-resource"
    return parts[-1]


def _resolve_subscription_id() -> str:
    configured_id = os.getenv("AZURE_SUBSCRIPTION_ID", "").strip()
    if configured_id:
        return configured_id
    raise RuntimeError("AZURE_SUBSCRIPTION_ID is required in .env for analysis.")


def get_azure_insights() -> Dict[str, Any]:
    load_dotenv(
        dotenv_path=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
        override=False,
    )
    # Browser-based sign-in fallback avoids requiring Azure CLI in terminal.
    credential = DefaultAzureCredential(exclude_interactive_browser_credential=False)
    subscription_id = _resolve_subscription_id()
    resource_client = ResourceManagementClient(credential, subscription_id)
    advisor_client = AdvisorManagementClient(credential, subscription_id)

    resources: List[Dict[str, str]] = []
    for item in resource_client.resources.list():
        resources.append(
            {
                "resource_name": item.name or _extract_resource_name(getattr(item, "id", "")),
                "resource_type": item.type or "Unknown",
                "location": item.location or "Unknown",
            }
        )

    recommendations: List[Dict[str, str]] = []
    all_category_counts: Dict[str, int] = {}
    allowed_categories = {"Cost", "Performance", "Security", "Reliability", "OperationalExcellence"}
    for rec in advisor_client.recommendations.list():
        category = str(getattr(rec, "category", "") or "")
        all_category_counts[category] = all_category_counts.get(category, 0) + 1
        if category not in allowed_categories:
            continue

        short_desc = getattr(rec, "short_description", None)
        resource_metadata = getattr(rec, "resource_metadata", None)
        impact = getattr(short_desc, "problem", None) or "Low"

        recommendations.append(
            {
                "resource_name": _extract_resource_name(getattr(resource_metadata, "resource_id", "")),
                "category": category,
                "impact_level": str(impact),
                "recommendation_text": getattr(short_desc, "solution", None)
                or getattr(short_desc, "problem", None)
                or "No recommendation text available.",
            }
        )

    notes: List[str] = []
    if not recommendations:
        notes.append("No Advisor recommendations found in allowed categories for this subscription.")
        if all_category_counts:
            notes.append(
                "Advisor returned other categories: "
                + ", ".join(f"{name}={count}" for name, count in sorted(all_category_counts.items()))
            )

    return {
        "subscription_id": subscription_id,
        "previously_deployed_projects": resources,
        "recommendations": recommendations,
        "advisor_category_counts": all_category_counts,
        "notes": notes,
    }


def main() -> int:
    try:
        payload = get_azure_insights()
        print(json.dumps(payload))
        return 0
    except Exception as exc:  # pylint: disable=broad-except
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
