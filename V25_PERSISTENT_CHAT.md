# FoodWise Pro v25 - Persistent Mobile Chat

- AI Assistant chat history is now stored in FoodWise state.
- Sending a second message no longer removes the first message.
- Chat survives mobile re-renders, navigation back to Assistant, and refresh/reopen after state sync.
- Chat history is capped at the latest 100 messages.
- Service-worker cache bumped to v25 so mobile receives the new JavaScript.
- v24 spoken inventory voice flow remains included.
