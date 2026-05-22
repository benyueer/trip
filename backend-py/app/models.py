import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class User(SQLModel, table=True):
    __tablename__ = "User"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    email: str = Field(nullable=False, unique=True, max_length=255)
    name: str = Field(nullable=False, max_length=255)
    avatar: Optional[str] = Field(default=None, max_length=500)
    provider: str = Field(nullable=False, max_length=50)
    providerId: str = Field(nullable=False, unique=True, max_length=255)
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)
    updatedAt: datetime = Field(default_factory=_utcnow, nullable=False)

    owned_trips: list["Trip"] = Relationship(back_populates="owner")
    shared_trips: list["TripShare"] = Relationship(back_populates="user")
    agent_sessions: list["AgentSession"] = Relationship(back_populates="user")
    memories: list["UserMemory"] = Relationship(back_populates="user")


class Trip(SQLModel, table=True):
    __tablename__ = "Trip"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    title: str = Field(nullable=False, max_length=255)
    description: str = Field(default="", max_length=2000)
    ownerId: Optional[str] = Field(default=None, foreign_key="User.id", max_length=36)
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)
    updatedAt: datetime = Field(default_factory=_utcnow, nullable=False)

    owner: Optional["User"] = Relationship(back_populates="owned_trips")
    days: list["Day"] = Relationship(
        back_populates="trip",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    shares: list["TripShare"] = Relationship(
        back_populates="trip",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Day(SQLModel, table=True):
    __tablename__ = "Day"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    dayIndex: int = Field(nullable=False)
    description: str = Field(default="", max_length=2000)
    tripId: str = Field(foreign_key="Trip.id", nullable=False, max_length=36)

    trip: "Trip" = Relationship(back_populates="days")
    items: list["Item"] = Relationship(
        back_populates="day",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Item(SQLModel, table=True):
    __tablename__ = "Item"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    type: str = Field(nullable=False, max_length=50)
    name: str = Field(nullable=False, max_length=500)
    lngLat: Any = Field(default=None, sa_column=Column("lngLat", Text, default="[]"))
    distance: Optional[str] = Field(default=None, max_length=100)
    duration: Optional[str] = Field(default=None, max_length=100)
    path: Any = Field(default=None, sa_column=Column("path", Text, default=None))
    description: Optional[str] = Field(default=None, max_length=2000)
    ticket: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=100)
    openingHours: Optional[str] = Field(default=None, max_length=500)
    rating: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=2000)
    dayId: str = Field(foreign_key="Day.id", nullable=False, max_length=36)

    day: "Day" = Relationship(back_populates="items")


class TripShare(SQLModel, table=True):
    __tablename__ = "TripShare"
    __table_args__ = (
        UniqueConstraint("tripId", "userId", name="trip_share_unique"),
    )

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    tripId: str = Field(foreign_key="Trip.id", nullable=False, max_length=36)
    userId: str = Field(foreign_key="User.id", nullable=False, max_length=36)
    permission: str = Field(default="view", max_length=50)
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)

    trip: "Trip" = Relationship(back_populates="shares")
    user: "User" = Relationship(back_populates="shared_trips")


class AgentSession(SQLModel, table=True):
    __tablename__ = "AgentSession"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    userId: str = Field(foreign_key="User.id", nullable=False, max_length=36)
    title: str = Field(nullable=False, max_length=500)
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)
    updatedAt: datetime = Field(default_factory=_utcnow, nullable=False)

    user: "User" = Relationship(back_populates="agent_sessions")
    messages: list["AgentMessage"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class AgentMessage(SQLModel, table=True):
    __tablename__ = "AgentMessage"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    sessionId: str = Field(foreign_key="AgentSession.id", nullable=False, max_length=36)
    role: str = Field(nullable=False, max_length=50)
    content: str = Field(nullable=False)
    meta: Any = Field(default=None, sa_column=Column("metadata", Text))
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)

    session: "AgentSession" = Relationship(back_populates="messages")


class UserMemory(SQLModel, table=True):
    __tablename__ = "UserMemory"

    id: str = Field(default_factory=_new_id, primary_key=True, max_length=36)
    userId: str = Field(foreign_key="User.id", nullable=False, max_length=36)
    content: str = Field(nullable=False)
    category: str = Field(default="preference", max_length=100)
    createdAt: datetime = Field(default_factory=_utcnow, nullable=False)
    updatedAt: datetime = Field(default_factory=_utcnow, nullable=False)

    user: "User" = Relationship(back_populates="memories")
