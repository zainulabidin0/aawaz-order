from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
ENGLISH_MODEL_PATH = BASE_DIR / "models" / "english" / "sentiment_model.pkl"
ENGLISH_VECTORIZER_PATH = BASE_DIR / "models" / "english" / "vectorizer.pkl"
ROMAN_MODEL_PATH = BASE_DIR / "models" / "roman" / "model.pkl"
ROMAN_VECTORIZER_PATH = BASE_DIR / "models" / "roman" / "vectorizer.pkl"
MAX_BATCH = 50

english_model = None
english_vectorizer = None
roman_model = None
roman_vectorizer = None


class ReviewInput(BaseModel):
    review: str = Field(min_length=1)


class BatchReviewInput(BaseModel):
    reviews: list[str] = Field(min_length=1, max_length=MAX_BATCH)


def _load_artifacts() -> None:
    global english_model, english_vectorizer, roman_model, roman_vectorizer

    missing = [
        str(path)
        for path in (
            ENGLISH_MODEL_PATH,
            ENGLISH_VECTORIZER_PATH,
            ROMAN_MODEL_PATH,
            ROMAN_VECTORIZER_PATH,
        )
        if not path.exists()
    ]
    if missing:
        raise RuntimeError(f"Missing model artifacts: {', '.join(missing)}")

    english_model = joblib.load(ENGLISH_MODEL_PATH)
    english_vectorizer = joblib.load(ENGLISH_VECTORIZER_PATH)
    roman_model = joblib.load(ROMAN_MODEL_PATH)
    roman_vectorizer = joblib.load(ROMAN_VECTORIZER_PATH)


def _predict_english(review: str) -> dict:
    if english_model is None or english_vectorizer is None:
        raise RuntimeError("English sentiment model is not loaded")

    text_vector = english_vectorizer.transform([review])
    prediction = int(english_model.predict(text_vector)[0])
    sentiment = "Positive" if prediction == 1 else "Negative"

    result = {
        "sentiment": sentiment,
        "label": prediction,
        "score": 1 if prediction == 1 else -1,
    }

    predict_proba = getattr(english_model, "predict_proba", None)
    if callable(predict_proba):
        probabilities = predict_proba(text_vector)[0]
        result["confidence"] = round(float(max(probabilities)) * 100, 2)

    return result


def _predict_roman(review: str) -> dict:
    if roman_model is None or roman_vectorizer is None:
        raise RuntimeError("Roman sentiment model is not loaded")

    text_vector = roman_vectorizer.transform([review])
    prediction = roman_model.predict(text_vector)[0]
    sentiment = str(prediction)

    result = {"sentiment": sentiment}

    predict_proba = getattr(roman_model, "predict_proba", None)
    if callable(predict_proba):
        probabilities = predict_proba(text_vector)[0]
        result["confidence"] = round(float(max(probabilities)) * 100, 2)

    return result


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_artifacts()
    yield
    global english_model, english_vectorizer, roman_model, roman_vectorizer
    english_model = None
    english_vectorizer = None
    roman_model = None
    roman_vectorizer = None


app = FastAPI(
    title="Aawaz Review Analysis API",
    description="Combined English and Roman Urdu review sentiment analysis",
    lifespan=lifespan,
)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    models_loaded = all(
        artifact is not None
        for artifact in (
            english_model,
            english_vectorizer,
            roman_model,
            roman_vectorizer,
        )
    )
    status = "ok" if models_loaded else "error"
    return {
        "status": status,
        "models_loaded": models_loaded,
        "model_loaded": models_loaded,  # alias for older clients
    }


@app.post("/predict")
def predict_sentiment(data: ReviewInput):
    review = data.review.strip()
    if not review:
        raise HTTPException(status_code=400, detail="Review text cannot be empty")

    errors: list[str] = []
    english_result = None
    roman_result = None

    try:
        english_result = _predict_english(review)
    except Exception as exc:
        errors.append(f"English model failed: {exc}")

    try:
        roman_result = _predict_roman(review)
    except Exception as exc:
        errors.append(f"Roman model failed: {exc}")

    if english_result is None and roman_result is None:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Both sentiment models failed to respond",
                "errors": errors,
            },
        )

    response = {"review": review}
    if english_result is not None:
        response["english_sentiment"] = english_result
    if roman_result is not None:
        response["roman_sentiment"] = roman_result
    if errors:
        response["warnings"] = errors

    return response


@app.post("/predict/batch")
def predict_batch(data: BatchReviewInput):
    reviews = [review.strip() for review in data.reviews if review.strip()]
    if not reviews:
        raise HTTPException(status_code=400, detail="No valid reviews in batch")

    results = []
    for review in reviews:
        item: dict = {"review": review}
        try:
            item["english_sentiment"] = _predict_english(review)
        except Exception as exc:
            item["english_error"] = str(exc)
        try:
            item["roman_sentiment"] = _predict_roman(review)
        except Exception as exc:
            item["roman_error"] = str(exc)
        results.append(item)

    return {"results": results}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
