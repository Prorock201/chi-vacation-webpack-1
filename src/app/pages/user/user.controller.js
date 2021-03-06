import {DAYSOFF, VACATIONS} from '../../core/constants/vacations.consts';

export default class UserController {

  constructor ($scope, $parse, $log, $timeout, sailsService, moment, toastr, user, $uibModal, settings, $rootScope, actions) {
    'ngInject';
    if (moment().weekday() === 6) $scope.startdate = new Date(moment().add(2, 'days')); else
    if (moment().weekday() === 0) $scope.startdate = new Date(moment().add(1, 'days')); else
    $scope.startdate = new Date();

    $scope.minStartDate = new Date($scope.startdate);
    $scope.enddate = new Date($scope.startdate);
    $scope.minEndDate = new Date($scope.startdate);

    this.user = user;
    this.DAYSOFF = DAYSOFF;
    this.VACATIONS = VACATIONS;
    this.today = new Date();
    this.$scope = $scope;
    this.actions = actions;
    this.$parse = $parse;
    this.$timeout = $timeout;
    this.vacationDays = this.calcDays();
    this.toastr = toastr;
    this.moment = moment;
    this.modal = $uibModal;
    this.$rootScope = $rootScope;
    this.$log = $log;
    this.sailsService = sailsService;
    this.activate($scope);
    this.vacationState = VACATIONS;
    this.sending = false;
    this.allVacations = this.combineVacations();
    this.holidays = angular.copy(settings.data.data.holidays);
    this.showNotification = false;
    this.calcEnableDays(this.$scope.startdate);
    this.calcDaysCalc();
  }

  activate(scope) {

    scope.$watch('startdate', function() {
      if (!scope.startdate) return;
      if (scope.enddate <= scope.startdate) scope.enddate = new Date(scope.startdate);
      scope.minEndDate = new Date(scope.startdate);
    });

    let destr = this.$rootScope.$on( this.actions.MONTHCHANGED, this.monthChanged.bind(this) );
    scope.$on('destroy', destr);
  }

  monthChanged(event, datepickerDate) {
    let days = moment().isoWeekdayCalc(this.user.employmentdate, moment(datepickerDate), [1,2,3,4,5,6,7]) - 1;
    let year = Math.floor(days / (365.25 + 30));
    let eDate = this.user.employmentdate;
    let minExpireDate, maxExpireDate;
    if (this.vacationState === this.VACATIONS) {
      minExpireDate = moment(eDate).add(1 + year, 'year').format('YYYY-MM');
      maxExpireDate = moment(eDate).add(1 + year, 'year').add(1, 'month').format('YYYY-MM');
      this.vacationExpire = moment(eDate).add(12, 'month').add(year, 'year').add(1, 'month').format('YYYY-MM-DD');
    } else {
      minExpireDate = moment(eDate).add(1 + year, 'year').subtract(1, 'month').format('YYYY-MM');
      maxExpireDate = moment(eDate).add(1 + year, 'year').format('YYYY-MM');
      this.vacationExpire = moment(eDate).add(12, 'month').add(year, 'year').format('YYYY-MM-DD');
    }
      this.showNotification = datepickerDate === minExpireDate || datepickerDate === maxExpireDate;
  }

  calcEnableDays(vacationStartDate) {
      let user = this.initUserData(vacationStartDate, this.user);
      this.monthChanged(null, moment(vacationStartDate).format('YYYY-MM'));

      if(user.year != 0 
        && ((user.formatedEmploymentDate.getMonth() == vacationStartDate.getMonth() && user.formatedEmploymentDate.getDate() <= vacationStartDate.getDate()) 
          || (new Date(moment(user.formatedEmploymentDate).add(1, 'month')).getMonth() == vacationStartDate.getMonth() && user.formatedEmploymentDate.getDate() > vacationStartDate.getDate()))) 
      {
        /*console.log(
          this.calcDays(moment(user.formatedEmploymentDate)
            .add(user.year, 'year')
            .add(1, 'month'), vacationStartDate), 
          this.calcDays(vacationStartDate, moment(user.formatedEmploymentDate)
            .add(user.year, 'year')
            .add(1, 'month')))*/

        user.vacations
          .filter( item => item.year == (user.year - 1) && item.status != "rejected" )
          .forEach( item => user.spendPrevVacation += this.calcDays(item.startdate, item.enddate));

        user.availablePrevDays += this.calcAvailablePrevDays(vacationStartDate, user);

        user.availableDays += user.availablePrevDays;
      }
      user.vacations
      .filter( item => item.year == user.year && item.status != "rejected" )
      .forEach( item => user.spendVacation += this.calcDays(item.startdate, item.enddate));

      /*console.log(user.totalDays)*/
      user.availableCurDays += user.totalDays - user.spendVacation;
      user.availableDays += user.availableCurDays < 0 ? 0 : user.availableCurDays;
      user.daysoff
      .filter( item => item.year == user.year && item.status != "rejected" )
      .forEach( item => {
        user.spendDaysOff += this.calcDays( item.startdate, item.enddate);
      });
      user.availableDaysOff = 5 - user.spendDaysOff + user.addedCurDaysOff;
      /*console.log(user);*/
  }

  calcAvailablePrevDays (vacationStartDate, user) {
    return (
    (user.totalPrevDays - user.spendPrevVacation > this.calcDays(vacationStartDate, moment(user.formatedEmploymentDate).add(user.year, 'year').add(1, 'month')) - 1) 
    ? this.calcDays( vacationStartDate, moment(user.formatedEmploymentDate).add(user.year, 'year').add(1, 'month') ) - 1 
    : user.totalPrevDays - user.spendPrevVacation);
  }

  initUserData(vacationStartDate, user) {
    let days = moment().isoWeekdayCalc(user.employmentdate, vacationStartDate, [1,2,3,4,5,6,7]) - 1;
    user.formatedEmploymentDate = new Date(user.employmentdate);
    user.year = Math.floor(days / 365.25);
    user.addedCur = user.added[user.year] || 0;
    user.addedPrev = user.added[user.year - 1] || 0;
    user.totalDays = Math.round((days % 365.25)*20/365.25) + user.addedCur;
    user.totalPrevDays = 20 + user.addedPrev;
    user.addedCurDaysOff = user.addedDaysOff[user.year] || 0;
    user.availableDays = 0;
    user.availableCurDays = 0;
    user.availablePrevDays = 0;
    user.spendVacation = 0;
    user.spendPrevVacation = 0;
    user.availableDaysOff = 0;
    user.spendDaysOff = 0;
    return user;
  }

  submitHandler(startDate, endDate) {
    this.sending = true;
    let vac_type = this.vacationState === this.VACATIONS ? 'Vacation' : 'Day-off';
    let vm = this;
    let sDate = new Date(startDate).getTime();
    let eDate = new Date(endDate).getTime();
    //let toastrOptions = {progressBar: false};
    
    let listArray = [];
    vm.vacations = [];
    listArray.push(this.user['vacations']);
    listArray.push(this.user['daysoff']);

    listArray.forEach( list => {
      if (list) {
        for (let item in list) {
          if (list[item].status === 'rejected') continue;
          vm.vacations.push({startDate: list[item].startdate, endDate: list[item].enddate, status: list[item].status, commentary: list[item].commentary});
        }
      }
    });

    if (vm.vacations && isCrossingIntervals(vm.vacations)) {
      this.toastr.error(vac_type + ' intervals are crossing! Please, choose correct date.');
      this.sending = false;
      return;
    }

    let total = this.vacationState === this.VACATIONS ? this.user.availableDays : this.user.availableDaysOff;
    if (this.user.vacationDays > total) {
      this.toastr.error('You have exceeded the number of available days!');
      this.sending = false;
      return;
    }

    let vacation = {
      startdate: new Date(sDate),
      enddate: new Date(eDate),
      //status: 'inprogress',
      commentary: null,
      status: "new"
    };
    const create = this.sailsService['create' + this.vacationState];

    const { id: uid, year } = this.user;
    const { startdate, enddate, status } = vacation;
    const createError = ({data}) => {
      this.sending = false; 
      this.toastr.error(this.$parse('raw.message')(data) || this.$parse('data.raw.message')(data) || '', 'Error creating ' + vac_type.toLowerCase())
    };
    const createSuccess = res => {
      this.toastr.success(vac_type + ' request was sent successfully!');
      if (!_.find(this.user[this.vacationState], {id:res.data.id}))
        this.user[this.vacationState].push(res.data);
      this.calcEnableDays(this.$scope.startdate);
      this.sending = false;
    }


    if(this.vacationState == "daysoff") {
      create({uid, startdate, enddate, status, year })
       .then(createSuccess, createError);
      return;
    }

    if(this.user.availablePrevDays <= 0) {
      create({uid, startdate, enddate, status, year })
       .then(createSuccess, createError);
      return;
    }

    if(this.user.vacationDays > this.user.availablePrevDays){
      let mDate = moment(sDate).isoAddWeekdaysFromSet(this.user.availablePrevDays - 1, [1,2,3,4,5], angular.copy(this.holidays));
      create({uid, startdate, enddate: new Date(mDate), status, year: year - 1 })
       .then(createSuccess, createError);
      create({uid, startdate: moment(new Date(mDate)).add(1, 'day'), enddate, status, year })
       .then(createSuccess, createError);
    } else {
      create({uid, startdate, enddate, status, year: year - 1 })
       .then(createSuccess, createError);
    }

    function isCrossingIntervals(dateIntervals) {
      if(dateIntervals.length === 0) return false;

      let result = dateIntervals.filter(function(item) {
        if  (sDate <= new Date(item.endDate).getTime() && eDate >= new Date(item.startDate).getTime()) {
          return true;
        }
      });

      return !!result.length;

    }
  }

  calcDaysCalc() {
    this.$timeout(()=> {
      if (this.$scope.startdate && this.$scope.enddate) {
        this.user.vacationDays = this.moment().isoWeekdayCalc(this.$scope.startdate, this.$scope.enddate, [1, 2, 3, 4, 5], angular.copy(this.holidays));
        this.calcEnableDays(this.$scope.startdate)
      } else {
        this.user.vacationDays = 0;
      }
    });

  }

  calcDays(startDate, endDate) {
    return moment().isoWeekdayCalc(startDate, endDate, [1, 2, 3, 4, 5], angular.copy(this.holidays))
  }

  changeVacationState(state) {
    this.vacationState = state;
    this.calcEnableDays(this.$scope.startdate);
  }

  isVacationState(state) {
    return this.vacationState === state;
  }

  deleteVacation(item) {
    this.sailsService[this.vacationState + 'Resource'].delete( { id: item.id} ).$promise
    .then(
      r => {
        if(_.findIndex(this.user[this.vacationState], {id: item.id}) != -1) {
          this.user[this.vacationState].splice(_.findIndex(this.user[this.vacationState], {id: item.id}), 1);
        }
        this.calcEnableDays(this.$scope.startdate);
        this.toastr.success('Vacation was deleted successfully!')
      },
      e => this.toastr.error(e.data.data.raw.message, 'Error deleting vacation')
    );
  }

  combineVacations() {
    return this.user.vacations.concat(this.user.daysoff);
  }

}
