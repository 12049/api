import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pageDir = (name) => {
    return path.join(__dirname, '..', 'public', 'html', `${name}.html`)
};

function setupPages(app, options = {}) {

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
    res.sendFile(pageDir("app"));
  });
  
};

export default setupPages;
