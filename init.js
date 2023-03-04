/**
 * Init
 */

// ++ Express
const express = require("express");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ++ OCR
const OCRController = require("./Controllers/OCRController");
/**
 * Init
 */
async function init() {
  /**
   * Express
   */
  try {
    await app.listen(80);
  } catch (e) {
    console.error("Init -> server exception", e.toString());
  }

  console.log("Init -> server listening");

  /**
   * Init OCRController
   */
  OCRController.init();

  /**
   * GET - Health check
   */
  app.get("*/health", (req, res) => res.sendStatus(200));

  /**
   * GET - Test
   */
  // app.get('*/test', async (req, res) => res.json(await OCRController.test()))
  // Post
  app.post("*/process-file", async (req, res) => {
    return res.json(await OCRController.processFile(req.body));
  });

  /**
   * Not Found
   */
  app.use((req, res, next) =>
    res.status(404).send({ status: "error", msg: "404 Not Found" })
  );
}

init();
