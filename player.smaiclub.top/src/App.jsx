import { IS_DEV_UI } from './config/uiEntry';
import DevEntry from './entries/DevEntry';
import ProdEntry from './entries/ProdEntry';

export default function App() {
  return IS_DEV_UI ? <DevEntry /> : <ProdEntry />;
}
