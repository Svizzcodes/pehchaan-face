# MobileFaceNet TFLite Model

Place the `mobilefacenet.tflite` file in this directory.

## Download

The MobileFaceNet model is available from the following open-source repositories:

1. **Recommended**: https://github.com/sirius-ai/MobileFaceNet_TF
   - Download the `.tflite` export (~2MB)

2. **Alternative**: https://github.com/deepinsight/insightface
   - Use the MobileFaceNet variant

## Model Specs

| Property | Value |
|---|---|
| Input | 112×112×3 float32, normalized to [-1, 1] |
| Output | 192-dim float32 embedding |
| Size | ~2MB |
| Inference time | ~50-150ms on mid-range devices |

## Integration

The model is loaded in `src/face/modelRunner.ts` via `react-native-fast-tflite`.

For the hackathon prototype, the app uses mock embeddings when the model file
is not present. Replace with the real model for production accuracy.
