from fastapi import APIRouter, HTTPException
from app.models import ImageUploadRequest

router = APIRouter(tags=["upload"])


@router.post("/upload-image")
async def upload_image(req: ImageUploadRequest):
    if not req.data.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Invalid image data")
    if len(req.data) > 2_500_000:
        raise HTTPException(status_code=400, detail="Image too large (max ~1.8MB)")
    return {"url": req.data}
