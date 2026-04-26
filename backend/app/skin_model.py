import json
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

import torch
from openai import OpenAI
from PIL import Image
from torchvision import models, transforms


CLASS_NAMES = [
    "Actinic keratosis",
    "Atopic Dermatitis",
    "Benign keratosis",
    "Dermatofibroma",
    "Melanocytic nevus",
    "Melanoma",
    "Squamous cell carcinoma",
    "Tinea Ringworm Candidiasis",
    "Vascular lesion",
]


class SkinPredictor:
    def __init__(self, model_path: Path, metadata_path: Path) -> None:
        self.model_path = model_path
        self.metadata_path = metadata_path
        self.device = torch.device("cpu")
        self.model: Optional[torch.nn.Module] = None
        self.class_names = list(CLASS_NAMES)
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self._openai_client: Optional[OpenAI] = None

        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        self._load_artifacts()

    def _load_artifacts(self) -> None:
        if self.metadata_path.exists():
            data = json.loads(self.metadata_path.read_text())
            class_names = data.get("class_names") or []
            if class_names:
                self.class_names = class_names

        if not self.model_path.exists():
            raise RuntimeError(
                f"Trained model not found at {self.model_path}. "
                "Run `python -m app.train_skin_model` first."
            )

        model = models.efficientnet_b0(weights=None)
        in_features = model.classifier[1].in_features
        model.classifier[1] = torch.nn.Linear(in_features, len(self.class_names))
        state = torch.load(self.model_path, map_location=self.device)
        model.load_state_dict(state)
        model.eval()
        self.model = model

    def _get_openai_client(self) -> Optional[OpenAI]:
        if self._openai_client is not None:
            return self._openai_client
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        self._openai_client = OpenAI(api_key=api_key)
        return self._openai_client

    def predict_image(self, image_bytes: bytes) -> dict[str, Any]:
        if self.model is None:
            raise RuntimeError("Model is not loaded")

        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        tensor = self.transform(image).unsqueeze(0)
        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            confidence, idx = torch.max(probs, dim=0)

        top_k = min(3, len(self.class_names))
        values, indices = torch.topk(probs, top_k)
        top_predictions = [
            {
                "label": self.class_names[int(i)],
                "confidence": round(float(v) * 100, 2),
            }
            for v, i in zip(values, indices)
        ]
        return {
            "label": self.class_names[int(idx)],
            "confidence": round(float(confidence) * 100, 2),
            "top_predictions": top_predictions,
        }

    def predict_openai(
        self,
        symptoms: list[str],
        duration_days: int,
        condition: str,
        ml_top_predictions: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        client = self._get_openai_client()
        if client is None:
            return None

        prompt = (
            "You are a dermatology triage assistant for an educational college project.\n"
            "Important safety rules:\n"
            "- This is NOT medical advice and NOT for diagnosis/treatment.\n"
            "- Do not prescribe medicines, dosage, or treatment plans.\n"
            "- Provide only a best-effort classification from the allowed classes.\n\n"
            "Choose exactly one class from this list:\n"
            + "\n".join(f"- {name}" for name in self.class_names)
            + "\n\nClinical data:\n"
            + f"- Condition text: {condition or 'Not provided'}\n"
            + f"- Duration days: {duration_days}\n"
            + f"- Symptoms: {', '.join(symptoms) if symptoms else 'None'}\n"
            + f"- ML top predictions: {json.dumps(ml_top_predictions)}\n\n"
            "Return strict JSON with keys: label (string), confidence (integer 0-100), reasoning (array of 2 short strings). "
            "Reasoning must be cautious, educational, and include a reminder to consult a qualified doctor for real care."
        )
        try:
            response = client.responses.create(
                model=self.openai_model,
                input=prompt,
                temperature=0,
            )
            raw = response.output_text
            parsed = json.loads(raw)
            label = parsed.get("label")
            confidence = int(parsed.get("confidence", 0))
            reasoning = parsed.get("reasoning") or []
            if label not in self.class_names:
                return None
            return {
                "label": label,
                "confidence": max(0, min(100, confidence)),
                "reasoning": [str(x) for x in reasoning][:3],
                "model": self.openai_model,
            }
        except Exception:
            return None

