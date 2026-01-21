"""
MongoDB Connection Configuration

Uses motor for async MongoDB operations.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

# MongoDB connection settings
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017")
DATABASE_NAME = os.getenv("MONGODB_DATABASE", "well_agent")

# Global client instance
_client: Optional[AsyncIOMotorClient] = None


def get_mongo_client() -> AsyncIOMotorClient:
    """Get or create MongoDB client instance."""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(
            MONGODB_URL,
            serverSelectionTimeoutMS=2000  # Fail fast (2s) if server is down
        )
    return _client


def get_database():
    """Get the database instance."""
    client = get_mongo_client()
    return client[DATABASE_NAME]


async def close_mongo_connection():
    """Close MongoDB connection on shutdown."""
    global _client
    if _client is not None:
        _client.close()
        _client = None


async def check_connection() -> bool:
    """Check if MongoDB connection is healthy."""
    try:
        client = get_mongo_client()
        await client.admin.command('ping')
        return True
    except Exception:
        return False
