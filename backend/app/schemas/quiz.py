import uuid
from datetime import datetime
from pydantic import BaseModel


class QuizGenerateRequest(BaseModel):
    category_id: str | None = None
    document_ids: list[str] | None = None
    question_count: int = 5
    question_types: list[str] = ["choice", "short_answer"]
    type_counts: dict[str, int] | None = None  # e.g. {"choice": 3, "short_answer": 2}


class QuizAnswerRequest(BaseModel):
    question_id: str
    user_answer: str


class QuizAnswerResponse(BaseModel):
    id: str
    question_id: str
    user_answer: str
    is_correct: bool | None
    score: float | None
    feedback: str | None
    correct_answer: str | None = None  # revealed after submission
    explanation: str | None = None  # revealed after submission
    created_at: str

    model_config = {"from_attributes": True}


class QuizQuestionResponse(BaseModel):
    id: str
    question_type: str
    stem: str
    options: dict | None = None
    correct_answer: str | None = None  # hidden until answered
    explanation: str | None = None
    kb_reference: dict | None = None
    question_index: int
    answer: QuizAnswerResponse | None = None

    model_config = {"from_attributes": True}


class QuizSessionResponse(BaseModel):
    id: str
    category_id: str | None
    document_ids: list[str] | None = None
    question_count: int
    score: float | None
    status: str
    created_at: str
    completed_at: str | None
    questions: list[QuizQuestionResponse] = []

    model_config = {"from_attributes": True}


class QuizSessionListItem(BaseModel):
    id: str
    category_id: str | None
    document_ids: list[str] | None = None
    question_count: int
    score: float | None
    status: str
    created_at: str
    completed_at: str | None

    model_config = {"from_attributes": True}
