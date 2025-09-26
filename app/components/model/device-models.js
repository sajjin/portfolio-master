import google_home from '~/assets/google_home.glb';
import impreza from '~/assets/impreza.glb';

export const ModelAnimationType = {
  SpringUp: 'spring-up',
  LaptopOpen: 'laptop-open',
};

export const deviceModels = {
  google_home: {
    url: google_home,
    width: 374,
    height: 512,
    position: { x: 0, y: 0, z: 0 },
  },
  impreza: {
    url: impreza,
    width: 1280,
    height: 800,
    position: { x: 0, y: 0, z: 0 },
  },
};
