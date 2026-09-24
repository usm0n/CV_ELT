# Team website

Next.js (App Router, static export) site for the WIUT Hackathon 2026 CV track. The data comes
from `../tools/export_site_data.py` (written to `public/data` and `public/media`), and the live
demo calls the API in `../demo`. See the "Website and live demo" section of the main README.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in out/
```

- Content that is not generated lives in `src/content/`: `team.ts` (members and links) and
  `report.md` (the one-page report).
- Set `NEXT_PUBLIC_DEMO_API` (see `.env.example`) to point `/demo` at the inference API.
