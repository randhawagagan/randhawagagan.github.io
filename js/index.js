const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelectorAll('.nav__link')

navToggle.addEventListener('click', () => {
  document.body.classList.toggle('nav-open');
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    document.body.classList.remove('nav-open');
  })
})

let doc = document,
  id = (e) => {
    return doc.getElementById(e)
  },
  classGet = (e, n) => {
    return doc.getElementsByClassName(e)[n]
  },
  classLength = (e) => {
    return doc.getElementsByClassName(e).length
  };

const reveal = () => {
  // classGet('intro', 0).innerHTML = 'Gagan Randhawa'; //change this
  // $('#after').show();
  // $('.icons-social').animateCss('slideInUp')
  // $('.tagline').animateCss('slideInDown');
  // $('#after').animateCss('slideInUp')
}
let typed = new Typed('#typed', {
  stringsElement: '#typed-strings',
  typeSpeed: 50,
  onComplete: reveal,
});

// let Messenger = function (el) {
//   let m = this;
//   m.init = function () {
//     m.codeletters = "&#*+%?£@§$";
//     m.message = 0;
//     m.current_length = 0;
//     m.fadeBuffer = false;
//     m.messages = [
//       `${superGet.innerText}`,
//     ];
//     setTimeout(m.animateIn, 100);
//   };
//   m.generateRandomString = function (length) {
//     let random_text = '';
//     while (random_text.length < length) {
//       random_text += m.codeletters.charAt(Math.floor(Math.random() * m.codeletters.length));
//     }
//     return random_text;
//   };
//   m.animateIn = function () {
//     if (m.current_length < m.messages[m.message].length) {
//       m.current_length = m.current_length + 2;
//       if (m.current_length > m.messages[m.message].length) {
//         m.current_length = m.messages[m.message].length;
//       }

//       let message = m.generateRandomString(m.current_length);
//       el.innerHTML = message;
//       setTimeout(m.animateIn, 20);
//     } else {
//       setTimeout(m.animateFadeBuffer, 20);
//     }
//   };

//   m.animateFadeBuffer = function () {
//     if (m.fadeBuffer === false) {
//       m.fadeBuffer = [];
//       for (let i = 0; i < m.messages[m.message].length; i++) {
//         m.fadeBuffer.push({
//           c: (Math.floor(Math.random() * 12)) + 1,
//           l: m.messages[m.message].charAt(i)
//         });
//       }
//     }

//     let do_cycles = false;
//     let message = '';

//     for (let i = 0; i < m.fadeBuffer.length; i++) {
//       let fader = m.fadeBuffer[i];
//       if (fader.c > 0) {
//         do_cycles = true;
//         fader.c--;
//         message += m.codeletters.charAt(Math.floor(Math.random() * m.codeletters.length));
//       } else {
//         message += fader.l;
//       }
//     }
//     el.innerHTML = message;

//     if (do_cycles === true) {
//       setTimeout(m.animateFadeBuffer, 50);
//     } else {
//       setTimeout(m.cycleText, 2000);
//     }
//   };

//   m.cycleText = function () {
//     m.message = m.message + 1;
//     if (m.message >= m.messages.length) {
//       m.message = 0;
//     }

//     m.current_length = 0;
//     m.fadeBuffer = false;
//     el.innerHTML = ' ';

//     setTimeout(m.animateIn, 200);
//   };

//   m.init();
// }

// for (let i = 0; i < doc.getElementsByClassName('hashText').length; i++) {
//   let currentEl = doc.getElementsByClassName('hashText')[i];
//   superGet = currentEl;
//   let messenger = new Messenger(currentEl);
// }
