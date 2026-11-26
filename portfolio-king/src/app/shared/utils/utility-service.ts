import * as $ from 'jquery';

export class UtilityService {
  static errorTimer: any;
  static messageTimer: any;

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
