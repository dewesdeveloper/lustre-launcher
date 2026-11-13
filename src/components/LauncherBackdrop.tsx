import { useRef } from 'react';
import { useLauncherBackgroundSync } from './launcherBackground';

/** Фоновая сетка лаунчера ИЛИ пользовательский фон (изображение/видео) */
function LauncherBackdrop() {
  const bg = useLauncherBackgroundSync();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Фон из предмета/кастома — вместо сетки
  if (bg.url) {
    return (
      <div className="fx-layer pointer-events-none fixed top-0 left-0 w-full h-screen overflow-hidden" style={{ zIndex: 0 }}>
        <div
          className="absolute"
          style={{
            left: -200 + bg.offsetX,
            top: -120 + bg.offsetY,
            width: `calc(100% + 400px)`,
            height: `calc(100% + 240px)`,
            transform: `scale(${bg.scale})`,
            transformOrigin: 'center',
            opacity: bg.opacity,
            filter: bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
            backgroundImage: bg.isVideo ? 'none' : `url("${bg.url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!bg.isVideo && (
            <img src={bg.url} alt="" draggable={false} className="w-full h-full object-cover" />
          )}
        </div>

        {bg.isVideo && (
          <video
            ref={videoRef}
            src={bg.url}
            autoPlay
            loop
            muted
            playsInline
            className="absolute"
            style={{
              left: -200 + bg.offsetX,
              top: -120 + bg.offsetY,
              width: `calc(100% + 400px)`,
              height: `calc(100% + 240px)`,
              transform: `scale(${bg.scale})`,
              transformOrigin: 'center',
              opacity: bg.opacity,
              filter: bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
              objectFit: 'cover',
            }}
          />
        )}

        {/* Затемнение: центр тоже притушиваем, иначе яркий фон выжигает текст */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at center, rgba(5,4,7,0.4) 0%, #050407 100%)' }}
        />
      </div>
    );
  }

  // Стандартная сетка
  return (
    <div className="fx-layer pointer-events-none fixed top-0 left-0 w-full h-screen overflow-hidden" style={{ zIndex: 0 }}>
      <div className="absolute -inset-[60px] launcher-grid-pan" />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at center, transparent 0%, #050407 100%)' }}
      />
    </div>
  );
}

export default LauncherBackdrop;
