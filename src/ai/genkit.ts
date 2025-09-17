import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// By default, Genkit will look for a GEMINI_API_KEY environment variable.
// We will only initialize the plugin if the key is set, to prevent a server
// crash if it's missing. You will need to set this in your .env file.
const plugins = [];
if (process.env.GEMINI_API_KEY) {
  plugins.push(googleAI());
}

export const ai = genkit({
  plugins,
  model: 'googleai/gemini-2.5-flash',
});
