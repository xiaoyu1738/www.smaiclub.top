
export interface Volume {
  id: number | string;
  title: string;
  epubUrl: string;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  volumes: Volume[];
}

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}
