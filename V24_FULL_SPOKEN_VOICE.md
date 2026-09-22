# FoodWise Pro v24 - Full Spoken Voice

- Inventory assistant speaks every question aloud.
- Each accepted answer is acknowledged in the next spoken prompt.
- Full spoken confirmation before saving an item.
- Microphone permission is cached instead of repeatedly opening/releasing the audio source.
- Added a release delay before SpeechRecognition starts on mobile browsers to reduce `audio-capture / Could not start audio source` failures.
- Voice errors are also spoken aloud when an inventory conversation is active.
- Cleans stray “in” from commands such as “inventory in dal add karo”.
