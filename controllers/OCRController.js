/**
 * OCR
 */

const fs = require("fs");
const axios = require("axios");
const exec = require("await-exec");
const pdf = require("pdf-to-text");
const { v4: uuidv4 } = require("uuid");
const pdfParser = require("pdf-parse");
const { parsePDFFileSchema } = require("../schemas");

const STORAGE_DIR = "storage";
// const SAMPLE_FILE_URL = 'https://testrs.gov.cz/smlouva/soubor/201061/non-text-searchable.pdf'
const SAMPLE_FILE_URL = "";

module.exports = {
  /**
   * Init
   */
  init() {
    // create folder if not exists
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

    // any additional inital logic...
  },

  /**
   * Test request handler - not used
   * @deprecated
   */
  async test() {
    const file = `${STORAGE_DIR}/sample.pdf`;

    // download sample file
	let fileTest = 'https://www.reformex.ro/wp-content/uploads/2023/03/434be3a4-20f0-4472-9f41-cf7859f4a090.pdf';
    if (!fs.existsSync(file)) await this.downloadFile(fileTest, file);

    try {
      await this.process(file);

      return { status: "ok", file };
    } catch (e) {
      return { status: "error", message: e.toString() };
    }
  },

  async processFile(body) {
    try {
      await parsePDFFileSchema.validateAsync(body);
      const file_name = uuidv4();
      const file = `${STORAGE_DIR}/${file_name}.pdf`;
      const { file_url } = body;

	  console.log('OCR CONTROLLER')
      // download PDF file
      await this.downloadFile(file_url, file);

	  // process file
      const response = await this.process(file);

	  // delete files
      await this.deleteFile(file);
      return { status: "ok", data: response };
    } catch (e) {
      return { status: "error", message: e.toString() };
    }
  },

  /**
   * OCR & Process
   */
  async process(file) {
    // exec ocrmypdf & pdftotext
    try {
      let start = new Date();

      const outputFile = file.replace(".pdf", "-ocr.pdf");

      // ocrmypdf command
      const ocrResult = await exec(
        `ocrmypdf -l spa --output-type pdfa --optimize 3 --skip-text ${file} ${outputFile}`,
        { timeout: 900000 }
      );

      // check for ocr errors
      if (ocrResult.stderr.length && ocrResult.stderr.indexOf("ERROR") >= 0)
        console.info(`ocr failed for ${file}`, ocrResult);

      console.log(
        `Ocr (process) -> finished OCR on ${file} in %d secs.`,
        (new Date() - start) / 1000
      );

      start = new Date();

      // using pdfParser
      //   let dataBuffer = fs.readFileSync(outputFile);
      //   let response = null;
      //   let res = await pdfParser(dataBuffer);
      //   if (res?.text) {
      //     let extractedData = this.extractTextFromContents(res.text);
      //     response = extractedData;
      //   }

	  // using pdf-to-text
      let promisePDF = new Promise((resolve, _) => {
        // Using pdftotext
        pdf.pdfToText(outputFile, (err, contents) => {
          try {
            if (err) throw err;
            let response = this.extractTextFromContents(contents);
            resolve(response);
            return response;
          } catch (e) {
            console.error(
              `Ocr (process) -> pdfToText failed on ${file}:`,
              e.toString()
            );
            throw e;
          }
        });
      });

      response = await promisePDF;
      return response;
    } catch (e) {
      throw e;
    }
  },

  /**
   * Download file
   */
  async downloadFile(url, file) {
    console.log("Ocr (downloadFile) -> requesting file: ", url);

    const writer = fs.createWriteStream(file);

    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: 30000,
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  },

  async deleteFile(file) {
    try {
      const fileOCR = file.replace(".pdf", "-ocr.pdf");
      console.log("files to delete");
      console.log(file, fileOCR);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      if (fs.existsSync(fileOCR)) {
        fs.unlinkSync(fileOCR);
      }
    } catch (e) {
      console.log("Error deleting files: ", file, fileOCR);
    }
  },

  async extractTextFromContents(contents) {
    try {
      //   console.log(JSON.stringify(contents, null, 2));
      const result = contents.split(/\r?\n/);
      //   console.log(JSON.stringify(result, null, 2));

      let indexItems = -1;
      let saleDate = "";
      let buyerName = "";
      let buyerAddress = "";
      let orderId = "";
      let buyerId = "";
      let sellerName = "";
      let sellerAddress = "";
      let orderIdPassed = false;
      let USPSTRACKINGPassed = false;
      let items = [];

      for (let i = 0; i < result.length; i++) {
        if (result[i].trim() === "") continue;
        console.log(result[i]);
        if (result[i].startsWith("       ") && buyerName === "") {
          if (saleDate === "" && result[i].includes("PRIORITY")) {
            console.log("P:" + result[i]);
            saleDate = result[i + 1].trim();
            i = i + 1;
          }
          continue;
        }
        if (saleDate !== "") {
          if (buyerName === "") {
            buyerName = result[i];
            if (buyerName.includes("    ")) {
              buyerName = buyerName
                .substring(0, buyerName.indexOf("    "))
                .trim();
              continue;
            }
          } else {
            if (
              orderId === "" &&
              !result[i].includes("Order # ") &&
              orderIdPassed === false
            ) {
              buyerAddress = buyerAddress + result[i].trim() + " ";
              continue;
            }
            if (
              orderId === "" &&
              result[i].includes("Order # ") &&
              orderIdPassed === false
            ) {
              orderId = result[i].replace("Order # ", "").trim();
              buyerId = result[i + 1].replace("Buyer", "").trim();
              orderIdPassed = true;
              i = i + 1;
              continue;
            }

            if (orderId !== "" && buyerId !== "" && sellerName === "") {
              sellerName = result[i].trim();
              continue;
            }
            if (result[i].includes("USPS TRACKING #")) {
              USPSTRACKINGPassed = true;
              continue;
            }
            if (
              sellerName !== "" &&
              orderIdPassed === true &&
              USPSTRACKINGPassed === false
            ) {
              sellerAddress = sellerAddress + result[i].trim() + " ";
              continue;
            }

            if (result[i].includes("Items Ordered:")) {
              indexItems = i;
              break;
            }
          }
        }
      }

      console.log("indexItems: " + indexItems);
      console.log("saleDate: " + saleDate);
      console.log("buyerName: " + buyerName);
      console.log("buyerAddress: " + buyerAddress);
      console.log("orderId: " + orderId);
      console.log("buyerId: " + buyerId);
      console.log("sellerName: " + sellerName);
      console.log("sellerAddress: " + sellerAddress);

      //items
      for (let i = indexItems + 1; i < result.length; i++) {
        try {
          if (result[i].trim() === "") continue;
          let name = "";
          let description = "";
          let price = -1;
          let size = "";
          for (let j = i; j < result.length; j++) {
            if (name === "") {
              name = result[j].trim();
              continue;
            } else {
              if (result[j].includes("$") && result[j].includes(":")) {
                const priceAndSize = result[j].split(" ");

                for (let k = 0; k < priceAndSize.length; k++) {
                  if (priceAndSize[k].trim() !== "") {
                    if (price === -1) {
                      price = Number(priceAndSize[k].replace("$", ""));
                    } else {
                      size = priceAndSize[k].replace("Size:", "");
                    }
                  }
                }
              } else {
                description = description + result[j].trim() + " ";
              }
            }
            if (price !== -1 || size !== "") {
              i = j;
              break;
            }
          }
          if (price !== -1 || size !== "")
            items.push({
              name: name,
              description: description,
              price: price,
              size: size,
            });

          // i = i + 3;
        } catch {
          console.log("err");
        }
      }
      //   console.log("items: " + JSON.stringify(items));
      const rsp = {
        details: {
          saleDate: saleDate,
          orderId: orderId,
          buyerUsername: buyerId,
          buyerName: buyerName,
          sellerName: sellerName,
          sellerAddress: sellerAddress,
        },
        items: items,
      };
      //   console.log("RSP: " + JSON.stringify(rsp));
      return rsp;
    } catch (e) {
      return null;
    }
  },
};
