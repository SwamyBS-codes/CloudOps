"""
Azure Orchestrator Configuration Settings
Centralized configuration for CloudOps Azure deployment
"""

import os
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ORCHESTRATOR_ROOT = Path(__file__).resolve().parent.parent

# Azure Configuration
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
AZURE_RESOURCE_GROUP = os.getenv("AZURE_RESOURCE_GROUP", "cloudops-rg")
AZURE_CONTAINER_REGISTRY = os.getenv("AZURE_CONTAINER_REGISTRY", "cloudopsacr")
AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "cloudopsblob")
AZURE_STORAGE_CONNECTION_STRING = os.getenv(
    "AZURE_STORAGE_CONNECTION_STRING",
    "UseDevelopmentStorage=true"  # For Azurite local testing
)

# Container Instance Configuration
CONTAINER_REGISTRY_URL = os.getenv("CONTAINER_REGISTRY_URL", "")
CONTAINER_REGISTRY_USERNAME = os.getenv("CONTAINER_REGISTRY_USERNAME", "")
CONTAINER_REGISTRY_PASSWORD = os.getenv("CONTAINER_REGISTRY_PASSWORD", "")

# Deployment Configuration
DEPLOYMENT_TIMEOUT = int(os.getenv("DEPLOYMENT_TIMEOUT", "600"))  # 10 minutes
CONTAINER_CPU = int(os.getenv("CONTAINER_CPU", "1"))
CONTAINER_MEMORY = int(os.getenv("CONTAINER_MEMORY", "1"))

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_DIR = ORCHESTRATOR_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Paths
TEMP_DIR = ORCHESTRATOR_ROOT / "temp"
TEMP_DIR.mkdir(exist_ok=True)

def get_config():
    """Return configuration dictionary"""
    return {
        "subscription_id": AZURE_SUBSCRIPTION_ID,
        "resource_group": AZURE_RESOURCE_GROUP,
        "container_registry": AZURE_CONTAINER_REGISTRY,
        "storage_account": AZURE_STORAGE_ACCOUNT,
        "storage_connection_string": AZURE_STORAGE_CONNECTION_STRING,
        "deployment_timeout": DEPLOYMENT_TIMEOUT,
        "container_cpu": CONTAINER_CPU,
        "container_memory": CONTAINER_MEMORY,
        "log_level": LOG_LEVEL,
        "log_dir": str(LOG_DIR),
        "temp_dir": str(TEMP_DIR),
    }
