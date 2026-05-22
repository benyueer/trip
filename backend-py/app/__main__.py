import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:create_app",
        host="0.0.0.0",
        port=int(__import__("os").environ.get("PORT", "3001")),
        reload=True,
        factory=True,
    )
