import Vue from 'vue';
import farm from './store/farmClient';
import router from './router';
import store from './store';
import App from './App.vue'; // eslint-disable-line import/extensions
import './normalize.css';
import './bootstrap-simplex.min.css';
import './vars.css';
import './main.css';
import utils from '../utils';
import { createModuleLoader, createFieldModule, setRootRoute } from '../utils/fieldModules';
import components from '../components';
import t from '../components/t';

Vue.config.productionTip = false;

// Attach utils to the global namespace so Field Modules can access them.
if (window.farmOS === undefined) {
  window.farmOS = {};
}
window.farmOS.utils = utils;

// Provide a global namespace to which modules can attach their config.
if (window.farmOS.modules === undefined) {
  window.farmOS.modules = {};
}

// Register the shared component library globally so they can be accessed from
// any other component on the root Vue instance.
components.forEach((c) => { Vue.component(c.name, c); });

// Globally apply the t mixin, which provides translations along with the l10n module
Vue.mixin(t);

const deps = { ...store, state: store.state, router };
const loadFieldModule = createModuleLoader(deps);

export default (el, buildtimeMods) => {
  // Load build-time modules
  if (buildtimeMods !== undefined && buildtimeMods.length > 0) {
    buildtimeMods.forEach(mod => createFieldModule(mod, deps));
  }

  farm().info()
    .then((res) => {
      if (res?.client?.modules) {
        Object.values(res.client.modules).forEach(loadFieldModule);
        localStorage.setItem('modules', JSON.stringify(res.client.modules));
      }
      setRootRoute(res?.client?.modules, router);
    })
    // If the request fails, we can still load modules from cache.
    .catch(() => {
      const modules = JSON.parse(localStorage.getItem('modules'));
      if (modules) {
        Object.values(modules).forEach(loadFieldModule);
      }
      setRootRoute(modules, router);
    })
    .finally(() => new Vue({
      el,
      store,
      router,
      components: { App },
      template: '<App/>',
    }));
};
