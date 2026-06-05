import { registerRootComponent } from 'expo';

// Polyfill buffer globally before anything else loads
import { Buffer } from 'buffer';
declare var global: any;
global.Buffer = Buffer;

import App from './App';

registerRootComponent(App);
