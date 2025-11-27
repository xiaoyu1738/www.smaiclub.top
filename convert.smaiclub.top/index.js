import {
  LitElement,
  html,
  svg,
  css
} from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";
import { produce } from "https://cdn.jsdelivr.net/npm/immer@2.0.0/dist/immer.module.min.js";
import { ifDefined } from "https://unpkg.com/lit-html@^1.0.0/directives/if-defined.js?module";
import { repeat } from "https://unpkg.com/lit-html@^1.0.0/directives/repeat.js?module";

document.body.addEventListener(
  "dragover",
  e => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  },
  false
);

customElements.define(
  "ncmc-audio",
  class extends LitElement {
    static get properties() {
      return { src: { type: String } };
    }

    constructor() {
      super();

      this.playTrackHandler = /** @param {EventListener} e */ async e => {
        this.src = e.detail.url;
        await this.updateComplete;
        const audio = this.shadowRoot.querySelector("audio");
        audio.play();
      };
    }

    firstUpdated() {
      document.addEventListener("play-track", this.playTrackHandler);
    }

    static get styles() {
      return css`
        :host {
          display: block;
          width: 100%;
          transition: transform 0.3s ease;
          transform: translateY(100%);
        }

        :host([src]) {
           transform: translateY(0);
        }

        .player-container {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1rem 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
        }

        audio {
          width: 100%;
          max-width: 800px;
          height: 40px;
          outline: none;
        }

        audio::-webkit-media-controls-panel {
          background-color: transparent;
        }

        audio::-webkit-media-controls-play-button,
        audio::-webkit-media-controls-mute-button {
           background-color: rgba(255,255,255,0.1);
           border-radius: 50%;
        }

        [hidden] {
          display: none;
        }
      `;
    }

    // Reflect src property to attribute to style :host based on it
    updated(changedProperties) {
        if (changedProperties.has('src')) {
            if (this.src) {
                this.setAttribute('src', this.src);
            } else {
                this.removeAttribute('src');
            }
        }
    }

    render() {
      return html`
        <div class="player-container">
          <audio
            src=${ifDefined(this.src)}
            controls
          ></audio>
        </div>
      `;
    }
  }
);

customElements.define(
  "ncmc-list",
  class extends LitElement {
    static get properties() {
      return { tracks: { type: Array } };
    }

    constructor() {
      super();

      this.tracks = [];
      this.worker = new Worker("./worker.js");

      this.worker.addEventListener("message", e => {
        /**
         * @type {{id:number, type:"error"|"data", data:any}}
         */
        const data = e.data;

        if (data.type === "error") {
          // Ideally use a toast, but alert is fine for logic preservation
          console.error(`Error: ${this.tracks[data.id].file.name} is not ncm file.`);
          this.tracks = produce(this.tracks, draft => {
             draft[data.id].error = true;
          });
          return;
        }

        this.tracks = produce(this.tracks, draft => {
          Object.assign(draft[data.id], data.payload);
        });

        // Dispatch updated event for external status monitoring
        this.dispatchEvent(new CustomEvent('updated'));
      });

      this.fileHandler = /** @param {FileList} fileList */ fileList => {
        const files = [...fileList]
          .filter(f => f.name.endsWith(".ncm"))
          .map((file, index) => {
            return { id: this.tracks.length + index, file };
          });

        this.tracks = produce(this.tracks, draft => {
          files.forEach(file => draft.push(file));
        });

        this.dispatchEvent(new CustomEvent('updated'));

        this.worker.postMessage(files);
      };

      this.onUploadInputChange = {
        /**
         * @param {Event} e
         */
        handleEvent(e) {
          this.fileHandler(e.target.files);
        }
      };
    }

    firstUpdated() {
      super.firstUpdated();

      document.body.addEventListener(
        "drop",
        e => {
          e.preventDefault();
          e.stopPropagation();
          this.fileHandler(e.dataTransfer.files);
          return false;
        },
        false
      );
    }

    static get styles() {
      return css`
        :host {
            display: block;
        }

        section {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          padding: 1rem 0;
          animation: fadeIn 0.5s ease-out;
        }

        .drop-zone {
            width: 100%;
            height: 300px;
            border: 2px dashed rgba(255, 255, 255, 0.2);
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.03);
            cursor: pointer;
            transition: all 0.3s ease;
            color: #94a3b8;
            text-align: center;
        }

        .drop-zone:hover {
            background: rgba(255, 255, 255, 0.07);
            border-color: #818cf8;
            color: #f8fafc;
            transform: scale(1.01);
        }

        .drop-zone svg {
            width: 64px;
            height: 64px;
            margin-bottom: 1rem;
            fill: currentColor;
            opacity: 0.7;
        }

        .drop-zone h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
        }

        .drop-zone p {
            margin: 0.5rem 0 0;
            font-size: 0.9rem;
            opacity: 0.7;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        [hidden] {
          display: none !important;
        }
      `;
    }

    render() {
      const uploadIcon = svg`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M11 16V7.85l-2.6 2.6L7 9l5-5 5 5-1.4 1.45-2.6-2.6V16h-2zm-5 4c-1.1 0-2-.9-2-2v-5h2v5h12v-5h2v5c0 1.1-.9 2-2 2H6z"/>
        </svg>
      `;

      return html`
        <label ?hidden=${this.tracks.length !== 0} for="upload-ncm" class="drop-zone">
          ${uploadIcon}
          <h3>点击或拖拽上传 NCM 文件</h3>
          <p>支持批量上传 • 本地极速转换</p>
        </label>

        <section ?hidden=${this.tracks.length === 0}>
          ${repeat(
            this.tracks,
            track => track.id,
            track => html`
              <ncmc-card .track=${track} />
            `
          )}

          <!-- Small upload button when list is populated -->
          <label for="upload-ncm" style="display: flex; align-items: center; justify-content: center; min-height: 120px; border: 2px dashed rgba(255,255,255,0.2); border-radius: 12px; cursor: pointer; color: #94a3b8; transition: all 0.2s;" onmouseover="this.style.borderColor='#818cf8';this.style.color='#fff'" onmouseout="this.style.borderColor='rgba(255,255,255,0.2)';this.style.color='#94a3b8'">
            <div style="text-align: center">
                <div style="font-size: 2rem; line-height: 1;">+</div>
                <div style="font-size: 0.8rem; margin-top: 0.5rem;">添加更多</div>
            </div>
          </label>
        </section>

        <input
          id="upload-ncm"
          type="file"
          accept=".ncm"
          multiple
          @change=${e => this.fileHandler(e.target.files)}
          hidden
        />
      `;
    }
  }
);

const downloadButton = () => svg`
  <svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path>
  </svg>
`;

const playButton = () => svg`
  <svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 5v14l11-7z"></path>
  </svg>
`;

// A generic dark placeholder
const placeHolder = `data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="%23475569">No Cover</text></svg>`;

customElements.define(
  "ncmc-card",
  class extends LitElement {
    static get properties() {
      return { track: { type: Object } };
    }

    constructor() {
      super();
      this.playHandler = e => {
        e.preventDefault();
        document.dispatchEvent(
          new CustomEvent("play-track", {
            detail: { url: this.track.url }
          })
        );
      };
    }

    get name() {
      if (
        this.track.meta &&
        this.track.meta.musicName &&
        this.track.meta.artist
      ) {
        return (
          this.track.meta.artist.map(ar => ar[0]).join("/") +
          " - " +
          this.track.meta.musicName
        );
      }
      return this.track.file.name.slice(0, -4);
    }

    get title() {
        if (this.track.meta && this.track.meta.musicName) {
            return this.track.meta.musicName;
        }
        return this.track.file.name.slice(0, -4);
    }

    get artist() {
        if (this.track.meta && this.track.meta.artist) {
            return this.track.meta.artist.map(ar => ar[0]).join(", ");
        }
        return "Unknown Artist";
    }

    get album() {
      if (this.track.meta) {
        return this.track.meta.album;
      }
      return "Unknown Album";
    }

    get downloadName() {
      if (this.track.meta) {
        return this.track.file.name.slice(0, -3) + this.track.meta.format;
      }
      return this.track.file.name;
    }

    get albumPic() {
      return this.track.meta ? this.track.meta.albumPic : placeHolder;
    }

    static get styles() {
      return css`
        :host {
          display: block;
          position: relative;
        }

        .card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            height: 100%;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
            background: rgba(30, 41, 59, 0.9);
            border-color: rgba(129, 140, 248, 0.5);
        }

        .cover-area {
            position: relative;
            width: 100%;
            padding-top: 100%; /* 1:1 Aspect Ratio */
            background-color: #0f172a;
            overflow: hidden;
        }

        .cover-img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            transition: transform 0.5s ease;
        }

        .card:hover .cover-img {
            transform: scale(1.05);
        }

        .overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
            gap: 1rem;
        }

        .card:hover .overlay {
            opacity: 1;
        }

        /* Mobile touch support: always show controls slightly or on tap?
           For simplicity, relying on hover/tap behavior on mobile */

        .btn {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            color: white;
            text-decoration: none;
            backdrop-filter: blur(4px);
        }

        .btn:hover {
            background: rgba(255, 255, 255, 0.9);
            color: #0f172a;
            transform: scale(1.1);
        }

        .btn svg {
            fill: currentColor;
            width: 24px;
            height: 24px;
        }

        .info {
            padding: 1rem;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .title {
            font-weight: 600;
            color: #f8fafc;
            margin: 0 0 0.25rem 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 1rem;
        }

        .artist {
            color: #94a3b8;
            font-size: 0.875rem;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .status-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: bold;
            text-transform: uppercase;
            color: white;
            z-index: 10;
        }

        .status-processing {
            background: rgba(234, 179, 8, 0.9);
        }

        .status-done {
            background: rgba(34, 197, 94, 0.9);
        }

        .status-error {
            background: rgba(239, 68, 68, 0.9);
        }

        [hidden] {
          display: none !important;
        }
      `;
    }

    render() {
      if (this.track === undefined) return;

      const isReady = !!this.track.url;
      const isError = !!this.track.error;

      let statusClass = "status-processing";
      let statusText = "PROCESSING";

      if (isReady) {
          statusClass = "status-done";
          statusText = this.track.meta ? this.track.meta.format.toUpperCase() : "READY";
      } else if (isError) {
          statusClass = "status-error";
          statusText = "ERROR";
      }

      return html`
        <div class="card">
            <div class="status-badge ${statusClass}">${statusText}</div>

            <div class="cover-area">
                <div class="cover-img" style="background-image:url('${this.albumPic}')"></div>
                <div class="overlay">
                    <a
                      class="btn"
                      href="#"
                      ?hidden=${!isReady}
                      @click=${this.playHandler}
                      title="Play"
                    >${playButton()}</a>

                    <a
                      class="btn"
                      href="${this.track.url}"
                      ?hidden=${!isReady}
                      download="${this.downloadName}"
                      title="Download"
                    >${downloadButton()}</a>
                </div>
            </div>

            <div class="info">
                <h4 class="title" title="${this.title}">${this.title}</h4>
                <p class="artist" title="${this.artist}">${this.artist}</p>
            </div>
        </div>
      `;
    }
  }
);
