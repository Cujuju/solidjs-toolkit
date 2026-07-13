import { render } from 'solid-js/web';
import '@cujuju/solidjs-pill-number-picker/styles.css';
import './theme.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

render(() => <App />, root);
