import $ from 'jquery';

export class UtilityService {
  static errorTimer: any;
  static messageTimer: any;
  static loaderTimer: any;

  static showLoader() {
    clearTimeout(this.loaderTimer);
    const $loader = $('.loader');
    $loader.addClass('active').css({ display: 'flex', opacity: 1, visibility: 'visible' });
    
    try {
      if (typeof window !== 'undefined' && (window as any).dynamicLottie) {
        (window as any).dynamicLottie.goToAndPlay(0, true);
      }
    } catch (e) {}

    // Hard ceiling: max 3 seconds loading duration
    this.loaderTimer = setTimeout(() => {
      this.hideLoader();
    }, 3000);
  }

  static hideLoader() {
    clearTimeout(this.loaderTimer);
    const $loader = $('.loader');
    $loader.stop(true, true).animate({ opacity: 0 }, 200, function() {
      $(this).removeClass('active').css({ display: 'none', visibility: 'hidden' });
      try {
        if (typeof window !== 'undefined' && (window as any).dynamicLottie) {
          (window as any).dynamicLottie.pause();
        }
      } catch (e) {}
    });
  }

  static showError(msg) {
    $('.show-error .msg-box').text(msg);
    $('.show-error').css('top', '50%');
    this.errorTimer = setTimeout(() => {
      $('.show-error').css('top', '-50%');
    }, 4000)
  }

  static onCloseError() {
    $('.show-error').css('top', '-50%');
    clearTimeout(this.errorTimer);
  }

  static showMessage(msg, closeEnable = false, msgTimeout) {
    $('.show-message .msg-box').text(msg);
    $('.show-message').css('top', '50%');
    if (!closeEnable) {
      $('.show-message button').css('display', 'none');
    } else {
      $('.show-message button').css('display', 'block');
    }
    this.messageTimer = setTimeout(() => {
      $('.show-message').css('top', '-50%');
    }, msgTimeout)
  }

  static onCloseMessage() {
    $('.show-message').css('top', '-50%');
    clearTimeout(this.messageTimer);
  }


}
