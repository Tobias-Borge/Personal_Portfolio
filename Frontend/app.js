document.querySelector('.logo')       // finner FØRSTE element med class "logo"
document.querySelectorAll('nav a')    // finner ALLE <a>-elementer inni <nav>
// navLinks is an array of all the links in the navigation

const navLinks = document.querySelectorAll('nav a[href^="#"]');

// navLinks.forEach is a loop that iterates over each link in the navigation
navLinks.forEach(link => {
  // link.addEventListener is a function that adds an event listener to the link
  link.addEventListener('click', (e) => {
    // targetId is the id of the section that the link should scroll to
    const targetId = link.getAttribute('href');
    // targetSection is the section that the link should scroll to
    const targetSection = document.querySelector(targetId);

    // Only smooth-scroll when the section exists on this page
    if (!targetSection) return;

    e.preventDefault();
    targetSection.scrollIntoView({ behavior: 'smooth' });
  });
});

