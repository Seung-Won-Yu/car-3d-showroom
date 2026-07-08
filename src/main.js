import "./styles.css";

const app = document.querySelector("#app");
const sketchfabFrame = document.querySelector("#sketchfab-frame");
const statusEl = document.querySelector("#status");
const modelKicker = document.querySelector("#model-kicker");
const modelTitle = document.querySelector("#model-title");
const modelDescription = document.querySelector("#model-description");
const sourceLink = document.querySelector("#source-link");
const rotateButton = document.querySelector("#rotate-toggle");
const resetButton = document.querySelector("#reset-view");
const viewTabs = Array.from(document.querySelectorAll("[data-view]"));

const MODEL = {
  uid: "9d21deaa0174412283965baf323133a1",
  kicker: "Sketchfab embed",
  title: "Generic Hatchback with Interior",
  description: "실내, 문, 트렁크, 페달, 기어, 스티어링 휠이 포함된 일반 해치백 모델입니다.",
  source:
    "https://sketchfab.com/3d-models/car-generic-hatchback-gameready-with-interior-9d21deaa0174412283965baf323133a1",
  embed:
    "https://sketchfab.com/models/9d21deaa0174412283965baf323133a1/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_watermark=1",
  annotationTargets: {
    interior: 5,
    wheel: 2,
  },
  annotationHints: {
    interior: ["interior", "steering", "gear", "pedal", "seat"],
    wheel: ["wheel", "tyre", "tire", "rim"],
  },
  exteriorCamera: {
    desktop: {
      position: [3.85, -0.55, 0.88],
      target: [0.33, -0.34, 0.1],
      bounds: {
        maxDistance: 4.15,
        maxTargetDelta: 0.55,
        maxHeightDelta: 0.75,
      },
    },
    mobile: {
      position: [11.5, -0.85, 2.0],
      target: [0.33, -0.34, 0.1],
      bounds: {
        maxDistance: 11.55,
        maxTargetDelta: 0.85,
        maxHeightDelta: 1.1,
      },
    },
  },
};

let sketchfabApi = null;
let sketchfabReady = false;
let sketchfabDefaultCamera = null;
let sketchfabAnnotations = [];
let activeView = "exterior";
let pendingView = "exterior";
let autoSpin = false;
let spinAngle = 0;
let spinTimer = null;
let resizeTimer = null;
let cameraGuardTimer = null;
let isRestoringExteriorCamera = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function setActiveTab(viewName) {
  activeView = viewName;
  viewTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });
}

function setRotationButtonState(enabled) {
  rotateButton.setAttribute("aria-pressed", String(enabled));
  rotateButton.textContent = enabled ? "자동 회전 켬" : "자동 회전 끔";
}

function setModelDetails() {
  modelKicker.textContent = MODEL.kicker;
  modelTitle.textContent = MODEL.title;
  modelDescription.textContent = MODEL.description;
  sourceLink.href = MODEL.source;
}

function normalizeText(value) {
  if (value && typeof value === "object") {
    return [value.raw, value.rendered, value.name, value.title, value.description, value.text]
      .map(normalizeText)
      .join(" ");
  }

  return String(value || "").toLowerCase();
}

function getAnnotationIndex(viewName) {
  const targetIndex = MODEL.annotationTargets[viewName];

  if (
    Number.isInteger(targetIndex) &&
    targetIndex >= 0 &&
    targetIndex < sketchfabAnnotations.length
  ) {
    return targetIndex;
  }

  const hints = MODEL.annotationHints[viewName];
  if (!hints?.length || !sketchfabAnnotations.length) return null;

  const foundIndex = sketchfabAnnotations.findIndex((annotation) => {
    const haystack = [
      annotation.name,
      annotation.title,
      annotation.content,
      annotation.description,
      annotation.text,
    ]
      .map(normalizeText)
      .join(" ");

    return hints.some((hint) => haystack.includes(normalizeText(hint)));
  });

  return foundIndex >= 0 ? foundIndex : null;
}

function getExteriorCamera() {
  const preset = window.innerWidth < 700 ? MODEL.exteriorCamera.mobile : MODEL.exteriorCamera.desktop;

  return {
    position: [...preset.position],
    target: [...preset.target],
  };
}

function getExteriorPreset() {
  return window.innerWidth < 700 ? MODEL.exteriorCamera.mobile : MODEL.exteriorCamera.desktop;
}

function getDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isOutsideExteriorBounds(cameraState) {
  const preset = getExteriorPreset();
  const position = cameraState?.position;
  const target = cameraState?.target;

  if (!position || !target) return false;

  const presetDistance = getDistance(preset.position, preset.target);
  const currentDistance = getDistance(position, target);
  const targetDrift = getDistance(target, preset.target);
  const heightDrift = Math.abs(position[2] - preset.position[2]);

  return (
    currentDistance > preset.bounds.maxDistance ||
    currentDistance < presetDistance * 0.42 ||
    targetDrift > preset.bounds.maxTargetDelta ||
    heightDrift > preset.bounds.maxHeightDelta
  );
}

function restoreExteriorCamera(reason = "외관 최대 범위", duration = 0.45) {
  if (!sketchfabApi || !sketchfabReady || isRestoringExteriorCamera) return;

  const camera = getExteriorCamera();
  isRestoringExteriorCamera = true;
  sketchfabApi.hideAnnotationTooltips?.();
  sketchfabApi.unselectAnnotation?.();
  sketchfabApi.setCameraLookAt(camera.position, camera.target, duration, (error) => {
    isRestoringExteriorCamera = false;
    if (!error) {
      setStatus(`${MODEL.title}: ${reason} 안으로 돌아왔습니다.`);
    }
  });
}

function guardExteriorCamera() {
  if (!sketchfabApi || !sketchfabReady || activeView !== "exterior" || autoSpin) return;

  sketchfabApi.getCameraLookAt((error, cameraState) => {
    if (error || !isOutsideExteriorBounds(cameraState)) return;
    restoreExteriorCamera();
  });
}

function stopAutoSpin() {
  autoSpin = false;
  if (spinTimer) {
    clearInterval(spinTimer);
    spinTimer = null;
  }
}

function moveCamera(viewName) {
  pendingView = viewName;
  setActiveTab(viewName);
  stopAutoSpin();
  setRotationButtonState(false);

  if (!sketchfabApi || !sketchfabReady) {
    setStatus(`${MODEL.title}: 뷰어가 준비되면 선택한 시점으로 이동합니다.`);
    return;
  }

  if (viewName === "exterior") {
    restoreExteriorCamera("외관 고정 프레임", 0.8);
    return;
  }

  const annotationIndex = getAnnotationIndex(viewName);
  if (annotationIndex === null) {
    setStatus(`${MODEL.title}: ${viewName} annotation을 찾지 못해 이동하지 않았습니다.`);
    return;
  }

  sketchfabApi.showAnnotationTooltips?.();
  sketchfabApi.gotoAnnotation(
    annotationIndex,
    { preventCameraAnimation: false, preventCameraMove: false },
    (error, selectedIndex) => {
      if (error) {
        setStatus(`${MODEL.title}: 시점 이동에 실패했습니다. 잠시 후 다시 눌러보세요.`);
        return;
      }

      const resolvedIndex = Number.isInteger(selectedIndex) ? selectedIndex : annotationIndex;
      const annotation = sketchfabAnnotations[resolvedIndex];
      const label = annotation?.name || annotation?.title || `${resolvedIndex + 1}번 annotation`;
      setStatus(`${MODEL.title}: ${label} 시점으로 이동했습니다.`);
    },
  );
}

function setAutoSpin(enabled) {
  stopAutoSpin();
  setRotationButtonState(enabled);

  if (!enabled) return;

  if (!sketchfabApi || !sketchfabReady) {
    setStatus(`${MODEL.title}: 뷰어가 준비되면 자동 회전을 사용할 수 있습니다.`);
    setRotationButtonState(false);
    return;
  }

  autoSpin = true;
  const base = getExteriorCamera();
  const { position, target } = base;
  const offset = [
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ];
  const radius = Math.hypot(offset[0], offset[1]) || 7;
  const height = offset[2] || 2.3;

  const spinOnce = () => {
    if (!autoSpin) return;

    spinAngle += Math.PI / 6;
    sketchfabApi.setCameraLookAt(
      [
        target[0] + Math.cos(spinAngle) * radius,
        target[1] + Math.sin(spinAngle) * radius,
        target[2] + height,
      ],
      target,
      2.2,
    );
  };

  sketchfabApi.hideAnnotationTooltips?.();
  sketchfabApi.unselectAnnotation?.();
  setStatus(`${MODEL.title}: 자동 회전을 시작했습니다.`);
  spinOnce();
  spinTimer = setInterval(spinOnce, 2300);
}

function loadAnnotations(api, onDone) {
  if (!api.getAnnotationList) {
    onDone();
    return;
  }

  api.getAnnotationList((error, annotations) => {
    sketchfabAnnotations = error || !Array.isArray(annotations) ? [] : annotations;
    onDone();
  });
}

function initViewer() {
  app.classList.add("is-embed-mode");
  setModelDetails();
  setRotationButtonState(false);
  setStatus(`${MODEL.title}: 3D 뷰어를 준비하는 중입니다.`);

  if (!window.Sketchfab) {
    sketchfabFrame.src = MODEL.embed;
    setStatus(`${MODEL.title}: 기본 임베드로 열렸습니다.`);
    return;
  }

  const client = new window.Sketchfab("1.12.1", sketchfabFrame);
  client.init(MODEL.uid, {
    autostart: 1,
    preload: 1,
    ui_infos: 0,
    ui_theme: "dark",
    ui_watermark: 1,
    success(api) {
      sketchfabApi = api;
      api.start();
      api.addEventListener("viewerready", () => {
        sketchfabReady = true;
        api.setCameraEasing?.("easeOutCubic");
        api.addEventListener("camerastop", () => {
          clearTimeout(cameraGuardTimer);
          cameraGuardTimer = setTimeout(guardExteriorCamera, 140);
        });
        api.getCameraLookAt((cameraError, cameraState) => {
          if (!cameraError && cameraState) {
            sketchfabDefaultCamera = cameraState;
          }

          loadAnnotations(api, () => {
            if (import.meta.env.DEV) {
              window.showroomDebug = {
                getAnnotations: () => sketchfabAnnotations,
                getDefaultCamera: () => sketchfabDefaultCamera,
                getCurrentCamera: () =>
                  new Promise((resolve) => {
                    sketchfabApi.getCameraLookAt((error, camera) => {
                      resolve(error ? null : camera);
                    });
                  }),
                forceCamera: (position, target) =>
                  sketchfabApi.setCameraLookAt(position, target, 0.1),
                guardExteriorCamera,
              };
            }
            moveCamera(pendingView);
          });
        });
      });
    },
    error() {
      sketchfabFrame.src = MODEL.embed;
      setStatus(`${MODEL.title}: API 초기화가 실패해서 기본 임베드로 열었습니다.`);
    },
  });
}

viewTabs.forEach((button) => {
  button.addEventListener("click", () => {
    moveCamera(button.dataset.view);
  });
});

rotateButton.addEventListener("click", () => {
  setAutoSpin(!autoSpin);
});

resetButton.addEventListener("click", () => {
  moveCamera("exterior");
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (activeView === "exterior" && sketchfabReady) {
      moveCamera("exterior");
    }
  }, 180);
});

window.addEventListener("beforeunload", stopAutoSpin);

initViewer();
