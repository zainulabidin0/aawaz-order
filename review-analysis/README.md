# Aawaz Review Analysis Service

FastAPI microservice for English and Roman Urdu product review sentiment analysis. Deploy this folder separately on [Render](https://render.com).

## Model files

Place trained `.pkl` artifacts before deploying:

```
review-analysis/models/
  english/
    sentiment_model.pkl
    vectorizer.pkl
  roman/
    model.pkl
    vectorizer.pkl
```

Train Roman Urdu models with the scripts in the `roman-modal` folder. English models can come from the `project-2/python-service` training pipeline.

## Local run

```bash
cd review-analysis
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Render deploy

1. Push this repo to GitHub.
2. In Render: **New → Blueprint** and point at `review-analysis/render.yaml`, or create a **Web Service** with:
   - Root directory: `review-analysis`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Copy the service URL (e.g. `https://aawaz-review-analysis.onrender.com`).
4. Set `REVIEW_ANALYSIS_SERVICE_URL` in the Aawaz Order Remix app environment on Vercel.

## API

| Method | Path | Body |
|--------|------|------|
| GET | `/health` | — |
| POST | `/predict` | `{ "review": "text" }` |
| POST | `/predict/batch` | `{ "reviews": ["a", "b"] }` |
