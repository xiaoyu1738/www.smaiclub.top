// This is a Cloudflare Pages function.
// It will be invoked when a request is made to /api/novels.
// It returns the content of NovelList.json.

const novelData = [
  {
    "id": "classroom-of-the-elite",
    "title": "欢迎来到实力至上主义的教室",
    "author": "衣笠彰梧",
    "coverUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/cover.png",
    "volumes": [
      {
        "id": 0,
        "title": "第 0 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2000.epub"
      },
      {
        "id": 1,
        "title": "第 1 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2001.epub"
      },
      {
        "id": 2,
        "title": "第 2 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2002.epub"
      },
      {
        "id": 3,
        "title": "第 3 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2003.epub"
      },
      {
        "id": 4,
        "title": "第 4 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2004.epub"
      },
      {
        "id": 5,
        "title": "第 4.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%204.5.epub"
      },
      {
        "id": 6,
        "title": "第 5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2005.epub"
      },
      {
        "id": 7,
        "title": "第 6 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2006.epub"
      },
      {
        "id": 8,
        "title": "第 7 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2007.epub"
      },
      {
        "id": 9,
        "title": "第 7.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%207.5.epub"
      },
      {
        "id": 10,
        "title": "第 8 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2008.epub"
      },
      {
        "id": 11,
        "title": "第 9 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2009.epub"
      },
      {
        "id": 12,
        "title": "第 10 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2010.epub"
      },
      {
        "id": 13,
        "title": "第 11 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2011.epub"
      },
      {
        "id": 14,
        "title": "第 11.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2011.5.epub"
      },
      {
        "id": 15,
        "title": "第 12 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2012.epub"
      },
      {
        "id": 16,
        "title": "第 13 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2013.epub"
      },
      {
        "id": 17,
        "title": "第 14 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2014.epub"
      },
      {
        "id": 18,
        "title": "第 15 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2015.epub"
      },
      {
        "id": 19,
        "title": "第 15.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2015.5.epub"
      },
      {
        "id": 20,
        "title": "第 16 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2016.epub"
      },
      {
        "id": 21,
        "title": "第 17 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2017.epub"
      },
      {
        "id": 22,
        "title": "第 18 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2018.epub"
      },
      {
        "id": 23,
        "title": "第 19 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2019.epub"
      },
      {
        "id": 24,
        "title": "第 20 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2020.epub"
      },
      {
        "id": 25,
        "title": "第 20.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2020.5.epub"
      },
      {
        "id": 26,
        "title": "第 21 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2021.epub"
      },
      {
        "id": 27,
        "title": "第 22 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2022.epub"
      },
      {
        "id": 28,
        "title": "第 23 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2023.epub"
      },
      {
        "id": 29,
        "title": "第 23.5 卷",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20-%2023.5.epub"
      },
      {
        "id": 30,
        "title": "短篇 01",
        "epubUrl": "https://novel.smaiclub.top/欢迎来到实力至上主义教室/欢迎来到实力至上主义的教室%20短篇%20-%2001.epub"
      }
    ]
  }
];

export const onRequest = async () => {
  return new Response(JSON.stringify(novelData), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
