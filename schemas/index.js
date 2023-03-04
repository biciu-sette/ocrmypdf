const Joi = require('joi');

const parsePDFFileSchema = Joi.object({
  file_url: Joi.string().required(),
});

module.exports = {
	parsePDFFileSchema
}
