import * as THREE from 'three';

function renderer(o) {
  o = o || {};
  var r = new THREE.WebGLRenderer({ antialias: false, alpha: !!o.alpha, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  if (o.tone === "aces") r.toneMapping = THREE.ACESFilmicToneMapping;
  else if (o.tone === "linear") r.toneMapping = THREE.LinearToneMapping;
  if (o.exposure) r.toneMappingExposure = o.exposure;
  if (o.alpha) r.setClearColor(0x000000, 0);
  if (o.shadows) {
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
  }
  return r;
}

class Finish {
  constructor(renderer, o) {
    this.r = renderer;
    this.o = o === true ? {} : o;
    this.failed = false;
  }

  size(w, h) {
    if (this.failed) return;
  
    var o = this.o;
    try {
      if (this.rt) {
        this.rt.setSize(w, h);
        this.mat.uniforms.uRes.value.set(w, h); return;
      }
      this.rt = new THREE.WebGLRenderTarget(w, h);
      this.mat = new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 },
          uContrast: { value: o.contrast == null ? 0.18 : o.contrast },
          uVignette: { value: o.vignette == null ? 0.32 : o.vignette },
          uGrain: { value: o.grain == null ? 0.025 : o.grain }
        },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: [
          "uniform sampler2D tColor; uniform vec2 uRes; uniform float uTime, uContrast, uVignette, uGrain;",
          "varying vec2 vUv;",
          "float rnd(vec2 p){ return fract(sin(dot(p + uTime, vec2(12.9898, 78.233))) * 43758.5453); }",
          "void main(){",
          "  vec3 col = texture2D(tColor, vUv).rgb;",
          "  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);",
          "  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;",
          "  col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(q) * 1.25);",
          "  col += (rnd(vUv * uRes) - 0.5) * uGrain;",
          "  gl_FragColor = vec4(col, 1.0);",
          "  #include <colorspace_fragment>",
          "}"
        ].join("\n"),
        depthTest: false, depthWrite: false
      });
      this.post = new THREE.Scene();
      this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    } catch { this.failed = true; }
  }
  render(scene, camera) {
    var r = this.r;
    if (!this.failed && this.rt) {
      try {
        this.mat.uniforms.uTime.value = (this.mat.uniforms.uTime.value + 0.37) % 100;
        r.setRenderTarget(this.rt); r.render(scene, camera);
        r.setRenderTarget(null); r.render(this.post, this.cam);
        return;
      } catch {
        this.failed = true;
        r.setRenderTarget(null);
      }
    }
    r.render(scene, camera);
  }
}

const Z3 = {
  mobile: !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches),
  dpr: (max) => Math.min(Z3.mobile ? 1 : (max || 1.5), window.devicePixelRatio || 1),

  lazy: (make) => {
    var made = null, tries = 0, last = -1e9;
    function get() {
      if (made || tries >= 20 || !THREE) return made;
      var now = window.performance ? performance.now() : Date.now();
      if (now - last < 500) return null;
      last = now; tries++;
      try { made = make(); } catch { made = null; }
      return made;
    }
    get.drop = () => made = null; /* 描くのに失敗したら捨てて、次で作り直す */
    return get;
  },

  Stage: class {
    constructor(o) {
      o = o || {};
      var c = o.camera || {};
      this.renderer = renderer(o.renderer);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(c.fov || 32, 540 / 960, c.near || 0.5, c.far || 200);
      this.maxDpr = o.dpr;
      this.finish = o.finish ? new Finish(this.renderer, o.finish) : null;
      this.w = this.h = 0;
    }

    /* 画面の大きさが変わったときだけ描画係とカメラを合わせ、描いてから写す。描けなかったら false */
    draw(ctx, W, H) {
      var dpr = Z3.dpr(this.maxDpr), w = Math.round(W * dpr), h = Math.round(H * dpr);
      if (!(w >= 2 && h >= 2)) return false; /* 画面の大きさが決まる前（0や数でない）は描かない */
      if (w !== this.w || h !== this.h) {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.w = w; this.h = h;
        if (this.camera.isPerspectiveCamera) {
          this.camera.aspect = W / H;
          this.camera.updateProjectionMatrix();
        }
        if (this.finish) this.finish.size(w, h);
      }
      if (this.finish) this.finish.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
      return true;
    }
  },

  lights: (scene, o) => {
    o = o || {};
    var k = o.scale || 1;
    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x3a3028, 0.55 * k));
    var key = new THREE.DirectionalLight(0xfff0e0, 2.4 * k);
    key.position.set(-4, 8, 6);
    if (o.shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(Z3.mobile ? 1024 : 2048, Z3.mobile ? 1024 : 2048);
      var s = o.shadowSize || 10, cam = key.shadow.camera;
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 0.5; cam.far = 60;
      key.shadow.bias = -0.0005;
    }
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xc8dcff, 1.0 * k);
    rim.position.set(6, 3, -5);
    scene.add(rim);

    var fill = new THREE.DirectionalLight(0xffe0cc, 0.4 * k);
    fill.position.set(5, 2, 6);
    scene.add(fill);
    return { key: key, rim: rim, fill: fill };
  },

  canvasTex: (w, h, paint, repeat) => {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    paint(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  }
};
export default Z3;