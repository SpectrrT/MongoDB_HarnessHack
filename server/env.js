import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
try {loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}
catch(error){if(error.code!=='ENOENT')throw Error('Could not load local environment settings.');}
