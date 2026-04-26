import json
from pathlib import Path

import torch
from torch import nn
from torch.optim import AdamW
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "dataset"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = ARTIFACTS_DIR / "skin_classifier.pt"
METADATA_PATH = ARTIFACTS_DIR / "skin_classifier.json"


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float]:
    model.eval()
    total = 0
    correct = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            preds = torch.argmax(logits, dim=1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()
            loss_sum += loss.item() * labels.size(0)
    return loss_sum / max(total, 1), (correct / max(total, 1)) * 100


def main() -> None:
    device = torch.device("cpu")
    train_tfms = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(12),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            transforms.RandomErasing(p=0.2, scale=(0.02, 0.15)),
        ]
    )
    val_tfms = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    train_ds = datasets.ImageFolder(DATASET_DIR / "train", transform=train_tfms)
    val_ds = datasets.ImageFolder(DATASET_DIR / "val", transform=val_tfms)
    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)

    model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
    for param in model.features.parameters():
        param.requires_grad = False
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, len(train_ds.classes))
    model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = AdamW(model.classifier.parameters(), lr=2e-3, weight_decay=1e-4)

    best_acc = 0.0
    best_state = None
    epochs = 24

    print(f"Training on {len(train_ds)} images, validating on {len(val_ds)} images")
    for epoch in range(1, epochs + 1):
        model.train()
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()

        if epoch == 11:
            for param in model.features.parameters():
                param.requires_grad = True
            optimizer = AdamW(model.parameters(), lr=2e-4, weight_decay=1e-4)

        val_loss, val_acc = evaluate(model, val_loader, device)
        print(f"Epoch {epoch:02d}/{epochs} - val_loss={val_loss:.4f} val_acc={val_acc:.2f}%")
        if val_acc > best_acc:
            best_acc = val_acc
            best_state = {k: v.cpu() for k, v in model.state_dict().items()}

    if best_state is None:
        raise RuntimeError("Training did not produce a model state")

    torch.save(best_state, MODEL_PATH)
    METADATA_PATH.write_text(
        json.dumps(
            {
                "class_names": train_ds.classes,
                "val_accuracy": round(best_acc, 2),
                "model_arch": "efficientnet_b0",
            },
            indent=2,
        )
    )
    print(f"Saved model to {MODEL_PATH}")
    print(f"Saved metadata to {METADATA_PATH}")
    print(f"Best validation accuracy: {best_acc:.2f}%")
    if best_acc < 90:
        print("WARNING: Best validation accuracy is below 90%.")


if __name__ == "__main__":
    main()

