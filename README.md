# 차종 3D 뷰어

실내가 포함된 차량 3D 모델을 웹에서 바로 확인하는 쇼룸 프로토타입입니다.  
외관, 실내, 휠 시점을 버튼으로 전환하고, Sketchfab Viewer API의 annotation을 이용해 실제 모델의 디테일 포인트로 이동합니다.

**Live Demo:** https://seung-won-yu.github.io/car-3d-showroom/

![차종 3D 뷰어 미리보기](docs/preview.png)

## 주요 기능

- 외관 뷰 자동 fit: 화면 크기에 맞춰 차량이 최대한 크게 보이도록 카메라 거리 조정
- 최대 줌아웃 제한: 외관, 실내, 휠 시점에서 차량이 화면 밖으로 멀리 빠지지 않도록 제어
- 실내 뷰: 스티어링 휠과 대시보드 쪽 annotation으로 이동
- 휠 뷰: 휠 annotation으로 바로 이동
- 자동 회전: 외관 카메라 기준으로 차량 주변을 천천히 회전
- 반응형 UI: 데스크톱과 모바일에서 컨트롤 패널이 겹치지 않도록 조정

## 기술 스택

- Vite
- Vanilla JavaScript
- Sketchfab Viewer API
- GitHub Pages

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173/`로 확인합니다.

## 빌드

```bash
npm run build
```

빌드 결과물은 `dist/`에 생성됩니다.

## 배포

`main` 브랜치에 push되면 GitHub Actions가 Vite 빌드를 수행하고 GitHub Pages로 배포합니다.

## 모델 출처

- [Car Generic Hatchback GameReady with interior](https://sketchfab.com/3d-models/car-generic-hatchback-gameready-with-interior-9d21deaa0174412283965baf323133a1)
