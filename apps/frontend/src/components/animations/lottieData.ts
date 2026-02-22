type LottieData = Record<string, unknown>;

function createPulseRingAnimation(
  name: string,
  strokeColor: [number, number, number, number]
): LottieData {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 100,
    h: 100,
    nm: name,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: `${name} Ring`,
        sr: 1,
        ks: {
          o: {
            a: 1,
            k: [
              { t: 0, s: [18], e: [85] },
              { t: 45, s: [85], e: [18] },
              { t: 90, s: [18] },
            ],
            ix: 11,
          },
          r: { a: 0, k: 0, ix: 10 },
          p: { a: 0, k: [50, 50, 0], ix: 2 },
          a: { a: 0, k: [0, 0, 0], ix: 1 },
          s: {
            a: 1,
            k: [
              { t: 0, s: [70, 70, 100], e: [112, 112, 100] },
              { t: 45, s: [112, 112, 100], e: [70, 70, 100] },
              { t: 90, s: [70, 70, 100] },
            ],
            ix: 6,
          },
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            it: [
              {
                d: 1,
                ty: 'el',
                s: { a: 0, k: [42, 42], ix: 2 },
                p: { a: 0, k: [0, 0], ix: 3 },
                nm: 'Ellipse Path 1',
                mn: 'ADBE Vector Shape - Ellipse',
                hd: false,
              },
              {
                ty: 'st',
                c: { a: 0, k: strokeColor, ix: 3 },
                o: { a: 0, k: 100, ix: 4 },
                w: { a: 0, k: 6, ix: 5 },
                lc: 2,
                lj: 2,
                nm: 'Stroke 1',
                mn: 'ADBE Vector Graphic - Stroke',
                hd: false,
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0], ix: 2 },
                a: { a: 0, k: [0, 0], ix: 1 },
                s: { a: 0, k: [100, 100], ix: 3 },
                r: { a: 0, k: 0, ix: 6 },
                o: { a: 0, k: 100, ix: 7 },
                sk: { a: 0, k: 0, ix: 4 },
                sa: { a: 0, k: 0, ix: 5 },
                nm: 'Transform',
              },
            ],
            nm: 'Ring Group',
            np: 3,
            cix: 2,
            bm: 0,
            ix: 1,
            mn: 'ADBE Vector Group',
            hd: false,
          },
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0,
      },
    ],
  };
}

export const snowflakePulseAnimation = createPulseRingAnimation('Snowflake Pulse', [
  0.231,
  0.51,
  0.965,
  1,
]);
export const flamePulseAnimation = createPulseRingAnimation('Flame Pulse', [
  0.961,
  0.62,
  0.043,
  1,
]);
export const housePulseAnimation = createPulseRingAnimation('House Pulse', [
  0.078,
  0.725,
  0.651,
  1,
]);
