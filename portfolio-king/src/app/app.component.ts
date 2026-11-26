import {Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import {PortfolioService} from "./services/portfolio/portfolio.service";
import {UtilityService} from "./shared/utils/utility-service";
import {Router, NavigationEnd, ActivatedRoute} from "@angular/router";

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  public currentUrl: string = '';
  public activeTab: string = 'overview';
  public isMuted: boolean = false;
  public isFullscreen: boolean = false;
  public sidebarCollapsed: boolean = false;
  public mobileNavOpen: boolean = false;
  public notificationsOpen: boolean = false;
  @ViewChild('notificationControl', { static: false }) notificationControl: ElementRef;

  constructor(public portfolioService: PortfolioService,
              private router: Router,
              private activatedRoute: ActivatedRoute) {
    this.init();
    this.portfolioService.sessionExpired.subscribe(message => {
      UtilityService.showError(message);
      this.notificationsOpen = false;
      this.router.navigate(['/login']);
    });
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl = event.urlAfterRedirects || event.url;
        this.mobileNavOpen = false;
        
        const urlTree = this.router.parseUrl(this.currentUrl);
        const adminPage = this.currentUrl.match(/^\/admin\/([^/?]+)/);
        if (adminPage) {
          this.activeTab = adminPage[1];
        } else if (this.currentUrl.includes('/rules')) {
          this.activeTab = 'rules';
        } else if (this.currentUrl.includes('/investment')) {
          this.activeTab = 'portfolio';
        } else if (this.currentUrl.includes('/game-status')) {
          this.activeTab = (this.user && this.user.isAdmin === 'true')
            ? (urlTree.queryParams && urlTree.queryParams['view'] === 'history' ? 'history' : 'results')
            : 'currentGame';
        } else if (this.currentUrl.includes('/game/')) {
          this.activeTab = 'currentGame';
        } else if (urlTree.queryParams && urlTree.queryParams['tab']) {
          this.activeTab = urlTree.queryParams['tab'];
        } else {
          this.activeTab = (this.user && this.user.isAdmin === 'true') ? 'overview' : 'currentGame';
        }
      }
    });
  }

  ngOnInit() {
    this.initLottieLoader();
  }

  private initLottieLoader() {
    if (typeof window !== 'undefined') {
      const initAnim = () => {
        const container = document.getElementById('dynamic-lottie-anim');
        if (container && (window as any).lottie && !(window as any).dynamicLottie) {
          (window as any).dynamicLottie = (window as any).lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: false,
            path: 'assets/loading-animation.json'
          });
        }
      };

      if ((window as any).lottie) {
        initAnim();
      } else {
        setTimeout(initAnim, 150);
      }

      // Mutation observer to guarantee 3s maximum duration and Lottie playback
      // even if external or legacy scripts directly manipulate .loader display
      const loaderEl = document.querySelector('.loader');
      if (loaderEl && typeof MutationObserver !== 'undefined') {
        let maxDurationTimer: any = null;
        const observer = new MutationObserver(() => {
          const isVisible = window.getComputedStyle(loaderEl).display !== 'none';
          if (isVisible) {
            if ((window as any).dynamicLottie) {
              (window as any).dynamicLottie.play();
            }
            clearTimeout(maxDurationTimer);
            maxDurationTimer = setTimeout(() => {
              UtilityService.hideLoader();
            }, 3000);
          } else {
            clearTimeout(maxDurationTimer);
            if ((window as any).dynamicLottie) {
              (window as any).dynamicLottie.pause();
            }
          }
        });
        observer.observe(loaderEl, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    }
  }

  init() {
    this.portfolioService.initSocket();
  }

  get user() {
    return this.portfolioService.user;
  }

  get isLoginPage(): boolean {
    return this.currentUrl.includes('/login');
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileNav() {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  toggleNotifications() {
    this.notificationsOpen = !this.notificationsOpen;
  }

  closeNotifications() {
    this.notificationsOpen = false;
  }

  @HostListener('document:click', ['$event'])
  closeNotificationsOutside(event: MouseEvent) {
    const target = event.target as Node;
    if (this.notificationControl &&
        !this.notificationControl.nativeElement.contains(target)) {
      this.closeNotifications();
    }
  }

  @HostListener('document:keydown.escape')
  closeNotificationsOnEscape() {
    this.closeNotifications();
  }

  toggleAudio() {
    this.isMuted = !this.isMuted;
    this.portfolioService.isMuted = this.isMuted;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      this.isFullscreen = true;
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      this.isFullscreen = false;
    }
  }

  onLogout() {
    this.portfolioService.onLogout().subscribe(
      () => this.router.navigate(['/login']),
      error => {
        if (error.status === 401) {
          this.portfolioService.clearExpiredSession('Your session has expired. Please sign in again.');
        } else {
          UtilityService.showError('Unable to log out. Please try again.');
        }
      }
    );
  }

  onCloseError() {
    UtilityService.onCloseError();
  }

  onCloseMessage() {
    UtilityService.onCloseMessage();
  }
}
