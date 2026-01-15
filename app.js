import express from 'express';
import cors from 'cors';

import setupApp from './main.js';
import setupPages from './src/lib/setupPages.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

 setupPages(app);
await setupApp(app);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


export default app;
