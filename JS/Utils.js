/* =========================
   FORMATAR TEMPO
========================= */

export function formatTime(seconds){
    if(isNaN(seconds)){
        return "0:00";
    }

    const min =
    Math.floor(seconds / 60);

    const sec =
    Math.floor(seconds % 60);

    return `${min}:${sec.toString().padStart(2,"0")}`;

}

export function removeExtension(filename){

    return filename.replace(/\.[^/.]+$/, "");

}