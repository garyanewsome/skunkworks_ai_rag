from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Skunkworks AI RAG API")

# Configure CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Change this to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Backend is up and running!"}
