from fastapi import APIRouter, HTTPException
from app.models import ImageUploadRequest

router = APIRouter(tags=["upload"])


@router.post("/upload-image")
async def upload_image(req: ImageUploadRequest):
    if not req.data.startswith("data:image"):
        raise HTTPException(status_code=400, detail="That file isn't a valid image. Please try another.")
    if len(req.data) > 2_500_000:
        raise HTTPException(status_code=400, detail="That image is too large. Please use one under 1.8 MB.")
    return {"url": req.data}
