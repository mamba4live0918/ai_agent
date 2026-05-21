from pydantic import BaseModel


class TrainingStatsOverview(BaseModel):
    total_users: int
    total_sessions: int
    completed_sessions: int
    active_sessions: int
    completion_rate: float
    average_score: float | None


class PerUserStats(BaseModel):
    user_id: str
    username: str
    role: str
    total_sessions: int
    completed_sessions: int
    average_score: float | None
    last_session_at: str | None


class TrainingTrendPoint(BaseModel):
    period: str
    total_sessions: int
    completed_sessions: int
    average_score: float | None
