FoodWise v21 Local Mode stores app state in data/local-state.json and creates data/local-auth.json for the local login password hash.
Both local data files are ignored by Git for deployment safety. Cloud/Render mode uses Firebase Authentication + MongoDB instead.
