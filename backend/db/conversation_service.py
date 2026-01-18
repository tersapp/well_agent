"""
Conversation Service - MongoDB CRUD operations for conversation history.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from bson import ObjectId
from backend.db.mongodb import get_database


class ConversationService:
    """Service for managing conversation history in MongoDB."""
    
    COLLECTION_NAME = "conversations"
    
    @classmethod
    def _get_collection(cls):
        db = get_database()
        return db[cls.COLLECTION_NAME]
    
    @classmethod
    async def create(cls, conversation: Dict[str, Any]) -> str:
        """
        Save a new conversation.
        
        Args:
            conversation: Conversation data including:
                - session_id: LAS file session identifier
                - well_name: Well name
                - depth_range: {start, end}
                - user_question: Original user query
                - messages: List of agent messages
                - final_decision: Final arbitrator decision
        
        Returns:
            str: Inserted document ID
        """
        collection = cls._get_collection()
        
        # Add timestamp if not present
        if "timestamp" not in conversation:
            conversation["timestamp"] = datetime.utcnow()
        
        result = await collection.insert_one(conversation)
        return str(result.inserted_id)
    
    @classmethod
    async def get_by_id(cls, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get a single conversation by ID."""
        collection = cls._get_collection()
        
        try:
            doc = await collection.find_one({"_id": ObjectId(conversation_id)})
            if doc:
                doc["_id"] = str(doc["_id"])
            return doc
        except Exception:
            return None
    
    @classmethod
    async def list_conversations(
        cls,
        skip: int = 0,
        limit: int = 20,
        well_name: Optional[str] = None,
        search_query: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        List conversations with pagination and filters.
        
        Args:
            skip: Number of documents to skip
            limit: Maximum number of documents to return
            well_name: Filter by well name
            search_query: Search in user_question field
            start_date: Filter by timestamp >= start_date
            end_date: Filter by timestamp <= end_date
        
        Returns:
            List of conversation documents
        """
        collection = cls._get_collection()
        
        # Build filter
        query = {}
        if well_name:
            query["well_name"] = {"$regex": well_name, "$options": "i"}
        if search_query:
            query["user_question"] = {"$regex": search_query, "$options": "i"}
        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date
        
        # Query with sort (newest first)
        cursor = collection.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        
        result = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            result.append(doc)
        
        return result
    
    @classmethod
    async def count_conversations(
        cls,
        well_name: Optional[str] = None,
        search_query: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> int:
        """Get total count of conversations matching filters."""
        collection = cls._get_collection()
        
        query = {}
        if well_name:
            query["well_name"] = {"$regex": well_name, "$options": "i"}
        if search_query:
            query["user_question"] = {"$regex": search_query, "$options": "i"}
        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date
        
        return await collection.count_documents(query)
    
    @classmethod
    async def delete(cls, conversation_id: str) -> bool:
        """Delete a conversation by ID."""
        collection = cls._get_collection()
        
        try:
            result = await collection.delete_one({"_id": ObjectId(conversation_id)})
            return result.deleted_count > 0
        except Exception:
            return False
