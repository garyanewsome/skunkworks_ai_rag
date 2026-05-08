# Notes

## To break up video

```
yt-dlp \
  --write-auto-sub \
  --write-sub \
  --sub-lang en \
  --skip-download \
  -J \
  "https://www.youtube.com/watch?v=pyX8kQ-JzHI" > output.json
```

## To abstract transcripts

```
yt-dlp --write-auto-subs --sub-langs en --convert-subs srt --skip-download "https://www.youtube.com/watch?v=pyX8kQ-JzHI" 
```

## To actually make it do things

`backend/.venv/bin/python backend/lecture_rag_agent.py "What is force equation mentioned in lecture?"`