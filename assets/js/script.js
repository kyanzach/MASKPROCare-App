// Custom JavaScript for NanoFix Maintenance App

$(document).ready(function() {
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
    
    // Initialize popovers
    $('[data-toggle="popover"]').popover();
    
    // Sidebar functionality removed - using unified navigation system
    
    // Mobile number validation
    $('#mobileNumber').on('input', function() {
        let value = $(this).val().replace(/\D/g, '');
        
        // Limit to 11 digits
        if (value.length > 11) {
            value = value.substring(0, 11);
        }
        
        // Format as 09XX XXX XXXX
        if (value.length > 4 && value.length <= 7) {
            value = value.substring(0, 4) + ' ' + value.substring(4);
        } else if (value.length > 7) {
            value = value.substring(0, 4) + ' ' + value.substring(4, 7) + ' ' + value.substring(7);
        }
        
        $(this).val(value);
    });
    
    // OTP input validation
    $('.otp-input').on('input', function() {
        let value = $(this).val().replace(/\D/g, '');
        
        // Limit to 1 digit per input
        if (value.length > 1) {
            value = value.substring(0, 1);
        }
        
        $(this).val(value);
        
        // Auto-focus next input
        if (value.length === 1) {
            $(this).next('.otp-input').focus();
        }
    });
    
    // OTP input backspace handling
    $('.otp-input').on('keydown', function(e) {
        if (e.keyCode === 8 && $(this).val() === '') {
            $(this).prev('.otp-input').focus();
        }
    });
    
    // Vehicle form validation
    $('#vehicleForm').on('submit', function(e) {
        let isValid = true;
        
        // Validate make
        if ($('#make').val().trim() === '') {
            $('#make').addClass('is-invalid');
            isValid = false;
        } else {
            $('#make').removeClass('is-invalid');
        }
        
        // Validate model
        if ($('#model').val().trim() === '') {
            $('#model').addClass('is-invalid');
            isValid = false;
        } else {
            $('#model').removeClass('is-invalid');
        }
        
        // Validate year
        const year = $('#year').val().trim();
        const currentYear = new Date().getFullYear();
        if (year === '' || isNaN(year) || year < 1900 || year > currentYear + 1) {
            $('#year').addClass('is-invalid');
            isValid = false;
        } else {
            $('#year').removeClass('is-invalid');
        }
        
        // Validate plate number
        if ($('#plateNumber').val().trim() === '') {
            $('#plateNumber').addClass('is-invalid');
            isValid = false;
        } else {
            $('#plateNumber').removeClass('is-invalid');
        }
        
        if (!isValid) {
            e.preventDefault();
        }
    });
    
    // Booking form validation
    $('#bookingForm').on('submit', function(e) {
        let isValid = true;
        
        // Validate vehicle
        if ($('#vehicleId').val() === '') {
            $('#vehicleId').addClass('is-invalid');
            isValid = false;
        } else {
            $('#vehicleId').removeClass('is-invalid');
        }
        
        // Validate service type
        if ($('#serviceTypeId').val() === '') {
            $('#serviceTypeId').addClass('is-invalid');
            isValid = false;
        } else {
            $('#serviceTypeId').removeClass('is-invalid');
        }
        
        // Validate date
        if ($('#scheduledDate').val() === '') {
            $('#scheduledDate').addClass('is-invalid');
            isValid = false;
        } else {
            $('#scheduledDate').removeClass('is-invalid');
        }
        
        // Validate time
        if ($('#scheduledTime').val() === '') {
            $('#scheduledTime').addClass('is-invalid');
            isValid = false;
        } else {
            $('#scheduledTime').removeClass('is-invalid');
        }
        
        if (!isValid) {
            e.preventDefault();
        }
    });
    
    // Profile form validation
    $('#profileForm').on('submit', function(e) {
        let isValid = true;
        
        // Validate first name
        if ($('#firstName').val().trim() === '') {
            $('#firstName').addClass('is-invalid');
            isValid = false;
        } else {
            $('#firstName').removeClass('is-invalid');
        }
        
        // Validate last name
        if ($('#lastName').val().trim() === '') {
            $('#lastName').addClass('is-invalid');
            isValid = false;
        } else {
            $('#lastName').removeClass('is-invalid');
        }
        
        // Validate email (if provided)
        const email = $('#email').val().trim();
        if (email !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                $('#email').addClass('is-invalid');
                isValid = false;
            } else {
                $('#email').removeClass('is-invalid');
            }
        } else {
            $('#email').removeClass('is-invalid');
        }
        
        if (!isValid) {
            e.preventDefault();
        }
    });
    
    // Date picker initialization
    if ($('#scheduledDate').length) {
        $('#scheduledDate').datepicker({
            format: 'yyyy-mm-dd',
            autoclose: true,
            startDate: new Date(),
            daysOfWeekDisabled: [0], // Disable Sundays
            todayHighlight: true
        }).on('changeDate', function() {
            // Clear time slot selection when date changes
            $('#scheduledTime').val('');
            $('#timeSlots').html('');
            
            // Get available time slots for selected date
            const date = $(this).val();
            if (date) {
                $.ajax({
                    url: 'api.php?endpoint=booking_slots',
                    type: 'GET',
                    data: { date: date },
                    dataType: 'json',
                    success: function(response) {
                        if (response.success && response.data.slots.length > 0) {
                            let html = '<div class="list-group">';
                            response.data.slots.forEach(function(slot) {
                                const formattedTime = formatTime(slot);
                                html += `<a href="#" class="list-group-item list-group-item-action time-slot" data-value="${slot}">${formattedTime}</a>`;
                            });
                            html += '</div>';
                            $('#timeSlots').html(html);
                            
                            // Time slot selection
                            $('.time-slot').on('click', function(e) {
                                e.preventDefault();
                                $('.time-slot').removeClass('active');
                                $(this).addClass('active');
                                $('#scheduledTime').val($(this).data('value'));
                            });
                        } else {
                            $('#timeSlots').html('<div class="alert alert-info">No available time slots for this date.</div>');
                        }
                    },
                    error: function() {
                        $('#timeSlots').html('<div class="alert alert-danger">Failed to load time slots.</div>');
                    }
                });
            }
        });
    }
    
    // Format time (HH:MM:SS to h:MM AM/PM)
    function formatTime(timeString) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }
    
    // Delete vehicle confirmation
    $('.delete-vehicle-btn').on('click', function() {
        const vehicleId = $(this).data('id');
        const vehicleName = $(this).data('name');
        
        $('#deleteVehicleModal .vehicle-name').text(vehicleName);
        $('#deleteVehicleForm input[name="vehicle_id"]').val(vehicleId);
    });
    
    // Cancel booking confirmation
    $('.cancel-booking-btn').on('click', function() {
        const bookingId = $(this).data('id');
        const bookingDate = $(this).data('date');
        
        $('#cancelBookingModal .booking-date').text(bookingDate);
        $('#cancelBookingForm input[name="booking_id"]').val(bookingId);
    });
    
    // Edit vehicle modal
    $('.edit-vehicle-btn').on('click', function() {
        const vehicleId = $(this).data('id');
        const make = $(this).data('make');
        const model = $(this).data('model');
        const year = $(this).data('year');
        const plateNumber = $(this).data('plate');
        const color = $(this).data('color');
        const vin = $(this).data('vin');
        
        $('#editVehicleModal #vehicleId').val(vehicleId);
        $('#editVehicleModal #make').val(make);
        $('#editVehicleModal #model').val(model);
        $('#editVehicleModal #year').val(year);
        $('#editVehicleModal #plateNumber').val(plateNumber);
        $('#editVehicleModal #color').val(color);
        $('#editVehicleModal #vin').val(vin);
    });
    
    // Tabs functionality
    $('.nav-tabs a').on('click', function(e) {
        e.preventDefault();
        $(this).tab('show');
    });
    
    // URL hash navigation for tabs
    if (window.location.hash) {
        const hash = window.location.hash;
        if ($(hash).length) {
            $('.nav-tabs a[href="' + hash + '"]').tab('show');
        }
    }
    
    // Change hash on tab change
    $('.nav-tabs a').on('shown.bs.tab', function(e) {
        window.location.hash = e.target.hash;
    });
    
    // Toggle dropdown menu for vehicle cards
    window.toggleDropdown = function(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.classList.toggle('d-none');
            
            // Close dropdown when clicking outside
            document.addEventListener('click', function closeDropdown(e) {
                if (!dropdown.contains(e.target) && e.target.id !== dropdownId && !e.target.closest(`button[onclick="toggleDropdown('${dropdownId}')"]`)) {
                    dropdown.classList.add('d-none');
                    document.removeEventListener('click', closeDropdown);
                }
            });
        }
    };
});