export interface Point {
  readonly x: string;
  readonly y: number;
}

export interface Series {
  readonly label: string;
  readonly color: string;
  readonly darkColor: string;
  readonly values: number[];
}
