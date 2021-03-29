import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Random from 'random-id';
import axios from 'axios';
import { CustomStep, OptionsStep, TextStep } from './steps_components';
import schema from './schemas/schema';
import * as storage from './storage';
import {
  ChatBotContainer,
  Content,
  Header,
  HeaderTitle,
  HeaderIcon,
  FloatButton,
  FloatingIcon,
  Footer,
  Input,
  SubmitButton
} from './components';
import Recognition from './recognition';
import { ChatIcon, CloseIcon, SubmitIcon, MicIcon } from './icons';
import { isMobile } from './utils';
import { speakFn } from './speechSynthesis';

class ChatBot extends Component {
  /* istanbul ignore next */
  constructor(props) {
    super(props);

    this.content = null;
    this.input = null;

    this.supportsScrollBehavior = false;

    this.setContentRef = element => {
      this.content = element;
    };

    this.setInputRef = element => {
      this.input = element;
    };

    this.state = {
      renderedSteps: [],
      previousSteps: [],
      currentStep: {},
      previousStep: {},
      steps: {},
      disabled: true,
      opened: props.opened || !props.floating,
      inputValue: '',
      inputInvalid: false,
      speaking: false,
      recognitionEnable: props.recognitionEnable && Recognition.isSupported(),
      defaultUserSettings: {},
      chatbotId: null,
      intentName: null,
      chatbotName: null,
      userId: null,
    };

    this.speak = speakFn(props.speechSynthesis);
  }

  componentDidMount() {
    const { steps, token } = this.props;
    const {
      botDelay,
      botAvatar,
      botName,
      cache,
      cacheName,
      customDelay,
      enableMobileAutoFocus,
      userAvatar,
      userDelay
    } = this.props;
    const chatSteps = {};

    if (!token) {
      return console.error('[@kcscope/chatbot-plugin] Please provide token');
    }

    axios.get(`https://fyp-ai-chatbot-server-7r4gm.ondigitalocean.app/api/chatbots/verify?token=${token}`)
      .then(res => {
        if (res.status === 201) {
          if (res.data.chatbotId) {
            this.setState({ chatbotId: res.data.chatbotId });
          } else {
            console.error('[@kcscope/chatbot-plugin] Token Incorrect!');
          }
        }
      })
      .catch(error => {
        console.error(error);
      })

    const defaultBotSettings = { delay: botDelay, avatar: botAvatar, botName };
    const defaultUserSettings = {
      delay: userDelay,
      avatar: userAvatar,
      hideInput: false,
      hideExtraControl: false
    };
    const defaultCustomSettings = { delay: customDelay };

    // for (let i = 0, len = steps.length; i < len; i += 1) {
    //   const step = steps[i];
    //   let settings = {};

    //   if (step.user) {
    //     settings = defaultUserSettings;
    //   } else if (step.message || step.asMessage) {
    //     settings = defaultBotSettings;
    //   } else if (step.component) {
    //     settings = defaultCustomSettings;
    //   }

    //   chatSteps[step.id] = Object.assign({}, settings, schema.parse(step));
    // }

    // schema.checkInvalidIds(chatSteps);

    // const firstStep = steps[0];
    const firstStep = {
      ...defaultBotSettings,
      id: '1',
      message: 'What can I help you with?'
    };
    chatSteps[firstStep.id] = Object.assign({}, firstStep);

    // if (firstStep.message) {
    //   const { message } = firstStep;
    //   firstStep.message = typeof message === 'function' ? message() : message;
    //   chatSteps[firstStep.id].message = firstStep.message;
    // }

    const { recognitionEnable } = this.state;
    const { recognitionLang } = this.props;

    if (recognitionEnable) {
      this.recognition = new Recognition(
        this.onRecognitionChange,
        this.onRecognitionEnd,
        this.onRecognitionStop,
        recognitionLang
      );
    }

    this.supportsScrollBehavior = 'scrollBehavior' in document.documentElement.style;

    if (this.content) {
      this.content.addEventListener('DOMNodeInserted', this.onNodeInserted);
      window.addEventListener('resize', this.onResize);
    }

    const { currentStep, previousStep, previousSteps, renderedSteps } = storage.getData(
      {
        cacheName,
        cache,
        firstStep,
        steps: chatSteps
      },
      () => {
        // // focus input if last step cached is a user step
        // this.setState({ disabled: false }, () => {
        //   if (enableMobileAutoFocus || !isMobile()) {
        //     if (this.input) {
        //       this.input.focus();
        //     }
        //   }
        // });
      }
    );

    // console.log('currentStep, defaultUserSettings, previousStep, previousSteps, renderedSteps, steps', currentStep, defaultUserSettings, previousStep, previousSteps, renderedSteps, steps)

    this.setState({
      currentStep,
      defaultUserSettings,
      defaultBotSettings,
      previousStep,
      previousSteps,
      renderedSteps,
      steps: chatSteps
    });
  }

  static getDerivedStateFromProps(props, state) {
    const { opened, toggleFloating } = props;
    if (toggleFloating !== undefined && opened !== undefined && opened !== state.opened) {
      return {
        ...state,
        opened
      };
    }
    return state;
  }

  componentWillUnmount() {
    if (this.content) {
      this.content.removeEventListener('DOMNodeInserted', this.onNodeInserted);
      window.removeEventListener('resize', this.onResize);
    }
  }

  onNodeInserted = event => {
    const { currentTarget: target } = event;
    const { enableSmoothScroll } = this.props;

    if (enableSmoothScroll && this.supportsScrollBehavior) {
      target.scroll({
        top: target.scrollHeight,
        left: 0,
        behavior: 'smooth'
      });
    } else {
      target.scrollTop = target.scrollHeight;
    }
  };

  onResize = () => {
    this.content.scrollTop = this.content.scrollHeight;
  };

  onRecognitionChange = value => {
    this.setState({ inputValue: value });
  };

  onRecognitionEnd = () => {
    this.setState({ speaking: false });
    this.handleSubmitButton();
  };

  onRecognitionStop = () => {
    this.setState({ speaking: false });
  };

  onValueChange = event => {
    this.setState({ inputValue: event.target.value });
  };

  getTriggeredStep = (trigger, value) => {
    const steps = this.generateRenderedStepsById();
    return typeof trigger === 'function' ? trigger({ value, steps }) : trigger;
  };

  getStepMessage = message => {
    const { previousSteps } = this.state;
    const lastStepIndex = previousSteps.length > 0 ? previousSteps.length - 1 : 0;
    const steps = this.generateRenderedStepsById();
    const previousValue = previousSteps[lastStepIndex].value;
    return typeof message === 'function' ? message({ previousValue, steps }) : message;
  };

  generateRenderedStepsById = () => {
    const { previousSteps } = this.state;
    const steps = {};

    for (let i = 0, len = previousSteps.length; i < len; i += 1) {
      const { id, message, value, metadata } = previousSteps[i];

      steps[id] = {
        id,
        message,
        value,
        metadata
      };
    }

    return steps;
  };

  triggerNextStep = async data => {
    const { enableMobileAutoFocus } = this.props;
    const {
      defaultBotSettings,
      defaultUserSettings,
      previousSteps,
      renderedSteps,
      inputValue,
      steps
    } = this.state;

    let { currentStep, previousStep } = this.state;
    const isEnd = currentStep.end;

    if (data && data.value) {
      currentStep.value = data.value;
    }
    if (data && data.hideInput) {
      currentStep.hideInput = data.hideInput;
    }
    if (data && data.hideExtraControl) {
      currentStep.hideExtraControl = data.hideExtraControl;
    }
    if (data && data.trigger) {
      currentStep.trigger = this.getTriggeredStep(data.trigger, data.value);
    }

    // console.log('currentStep', currentStep, currentStep.options && data)

    if (isEnd) {
      this.handleEnd();
    } else if (currentStep.options && data) {
      const option = currentStep.options.filter(o => o.value === data.value)[0];
      // const trigger = this.getTriggeredStep(option.trigger, currentStep.value);
      delete currentStep.options;

      // replace choose option for user message
      currentStep = Object.assign({}, currentStep, option, defaultUserSettings, {
        user: true,
        message: option.label
      });

      renderedSteps.pop();
      previousSteps.pop();
      renderedSteps.push(currentStep);
      previousSteps.push(currentStep);

      this.setState({
        currentStep,
        renderedSteps,
        previousSteps
      });
    } else if (currentStep.next) {
      if (currentStep.replace) {
        renderedSteps.pop();
      }

      const trigger = this.getTriggeredStep(currentStep.trigger, currentStep.value);
      let nextStep = Object.assign({}, steps[trigger]);

      // console.log('nextStep', nextStep);

      if (!Object.keys(nextStep).length) {
        nextStep = {
          id: trigger,
          user: true,
          trigger: currentStep.id + 1
        }
      }

      if (nextStep.message) {
        nextStep.message = this.getStepMessage(nextStep.message);
      } else if (nextStep.update) {
        const updateStep = nextStep;
        nextStep = Object.assign({}, steps[updateStep.update]);

        if (nextStep.options) {
          for (let i = 0, len = nextStep.options.length; i < len; i += 1) {
            nextStep.options[i].trigger = updateStep.trigger;
          }
        } else {
          nextStep.trigger = updateStep.trigger;
        }
      }

      nextStep.key = Random(24);

      previousStep = currentStep;
      currentStep = nextStep;

      // console.log('currentStep', currentStep)

      this.setState({ renderedSteps, currentStep, previousStep }, () => {
        if (nextStep.user) {
          this.setState({ disabled: false }, () => {
            if (enableMobileAutoFocus || !isMobile()) {
              if (this.input) {
                this.input.focus();
              }
            }
          });
        } else {
          renderedSteps.push(nextStep);
          previousSteps.push(nextStep);

          this.setState({ renderedSteps, previousSteps });
        }
      });
    }

    const { cache, cacheName } = this.props;
    if (cache) {
      setTimeout(() => {
        storage.setData(cacheName, {
          currentStep,
          previousStep,
          previousSteps,
          renderedSteps
        });
      }, 300);
    }
  };

  handleEnd = () => {
    const { handleEnd } = this.props;

    if (handleEnd) {
      const { previousSteps } = this.state;

      const renderedSteps = previousSteps.map(step => {
        const { id, message, value, metadata } = step;

        return {
          id,
          message,
          value,
          metadata
        };
      });

      const steps = [];

      for (let i = 0, len = previousSteps.length; i < len; i += 1) {
        const { id, message, value, metadata } = previousSteps[i];

        steps[id] = {
          id,
          message,
          value,
          metadata
        };
      }

      const values = previousSteps.filter(step => step.value).map(step => step.value);

      handleEnd({ renderedSteps, steps, values });
    }
  };

  isInputValueEmpty = () => {
    const { inputValue } = this.state;
    return !inputValue || inputValue.length === 0;
  };

  isLastPosition = step => {
    const { renderedSteps } = this.state;
    const { length } = renderedSteps;
    const stepIndex = renderedSteps.map(s => s.key).indexOf(step.key);

    if (length <= 1 || stepIndex + 1 === length) {
      return true;
    }

    const nextStep = renderedSteps[stepIndex + 1];
    const hasMessage = nextStep.message || nextStep.asMessage;

    if (!hasMessage) {
      return true;
    }

    const isLast = step.user !== nextStep.user;
    return isLast;
  };

  isFirstPosition = step => {
    const { renderedSteps } = this.state;
    const stepIndex = renderedSteps.map(s => s.key).indexOf(step.key);

    if (stepIndex === 0) {
      return true;
    }

    const lastStep = renderedSteps[stepIndex - 1];
    const hasMessage = lastStep.message || lastStep.asMessage;

    if (!hasMessage) {
      return true;
    }

    const isFirst = step.user !== lastStep.user;
    return isFirst;
  };

  handleKeyPress = event => {
    if (event.key === 'Enter') {
      this.submitUserMessage();
    }
  };

  handleSubmitButton = () => {
    const { speaking, recognitionEnable } = this.state;

    if ((this.isInputValueEmpty() || speaking) && recognitionEnable) {
      this.recognition.speak();
      if (!speaking) {
        this.setState({ speaking: true });
      }
      return;
    }

    this.submitUserMessage();
  };

  submitUserMessage = () => {
    const {
      defaultUserSettings,
      defaultBotSettings,
      inputValue,
      previousSteps,
      renderedSteps,
      steps,
      intentName,
      chatbotName,
      chatbotId,
      userId,
    } = this.state;
    let { currentStep } = this.state;

    if (!inputValue) {
      return;
    }

    const previousStep = previousSteps.slice(-1)[0];

    const isInvalid = false; //currentStep.validator && this.checkInvalidInput();

    if (!isInvalid) {
      const step = {
        ...defaultUserSettings,
        message: inputValue,
        value: inputValue,
        user: true,
        param: previousStep.trigger,
      };

      currentStep = Object.assign({}, step);

      renderedSteps.push(currentStep);
      previousSteps.push(currentStep);

      // console.log('currentStep, renderedSteps, previousSteps, inputValue', currentStep, renderedSteps, previousSteps, inputValue)

      this.setState(
        {
          currentStep,
          renderedSteps,
          previousSteps,
          disabled: true
        },
        () => {
          if (this.input) {
            this.input.blur();
          }
        }
      );

      if (previousStep.event) {
        const id = previousStep?.id + 1;

        if (steps[id]) {
          currentStep = Object.assign({}, steps[id]);
        } else {
          currentStep = Object.assign({}, {
            id: '99',
            next: true,
            message: 'Great! Thanks for your comment.',
            trigger: 'review',
            ...defaultBotSettings,
          });

          // window.setTimeout(() => {
          //   this._triggerCustomComponent();
          // }, 1000)
          // console.log('currentStep', currentStep);
          // console.log('previousStep', previousStep);
          const details = {};

          if (previousStep.isContactForm) {
            steps['review'] = {
              id: 'review',
              next: true,
              asMessage: true,
              trigger: 'contact',
              component: (
                <div style={{ width: '100%' }}>
                  <h3>Check out your summary</h3>
                  <table>
                    <tbody>
                      {
                        previousSteps.map(s => {
                          if (s.param) {
                            details[s.param] = s.value;
                            return (
                              <tr key={s.param}>
                                <td>{s.param}</td>
                                <td>{s.value}</td>
                              </tr>
                            )
                          }
                        })
                      }
                    </tbody>
                  </table>
                </div>
              ),
              ...defaultBotSettings,
            }
  
            steps['contact'] = {
              id: 'contact',
              message: 'Thanks for your message, we will get back you soon.',
              ...defaultBotSettings,
            }

            // console.log('details', details, intentName, chatbotName);
            const data = {
              userId,
              details,
              intentName,
              chatbotName,
            }

            axios.post('https://fyp-ai-chatbot-server-7r4gm.ondigitalocean.app/api/analytics/contactUsage', data)
              .then(function (response) {
                console.log(response);
              })
              .catch(function (error) {
                console.log(error);
              });
            
          }
        }

        renderedSteps.push(currentStep);
        previousSteps.push(currentStep);
        this.setState({
          steps,
          currentStep,
          renderedSteps,
          previousSteps,
          inputValue: this.input.value = null,
        });
        
      } else if (inputValue.length > 0) {
        
        axios.get(`https://fyp-ai-chatbot-server-7r4gm.ondigitalocean.app/api/chatbots/response?chatbotId=${chatbotId}&input=${inputValue}`)
          .then(res => {
            if (res.status === 201) {
              let message;
              let options;
              let component;
              let steps = {};

              switch (res.data.responseType) {
                case 'multiple':
                  options = res.data.response.map(r => ({
                    value: r,
                    label: r
                  }));
                  break;
                case 'card':
                  component = (
                    <div style={{ width: '60%' }}>
                      <img style={{ width: '100%' }} alt={res.data.response.title} src={res.data.response.imageUrl} />
                      <h2>{res.data.response.title}</h2>
                      <h3>{res.data.response.description}</h3>
                    </div>
                  );
                  break;
                case 'url':
                  component = (
                    <a target='_blank' href={res.data.response.url}>{res.data.response.text}</a>
                  );
                  break;
                case 'event':
                  res.data.response.forEach((r, i) => {
                    steps[i] = {
                      id: i,
                      message: r.text,
                      trigger: r.param,
                      event: true,
                      isContactForm: res.data.isContactForm,
                      ...defaultBotSettings,
                    }
                  })
                  break;
                case 'plainText':
                  message = res.data.response;
                  break;

                default:
                  message = res.data.response;
                  break;
              }

              const nextStep = {
                ...defaultBotSettings,
                id: '1'
              };

              message ? (nextStep.message = message) : undefined;
              options ? (nextStep.options = options) : undefined;
              component ? (nextStep.component = component) : undefined;

              currentStep = Object.assign({}, nextStep);
              
              if (Object.keys(steps).length) {
                currentStep = Object.assign({}, steps[0]);
                this.setState({ steps })
              }

              renderedSteps.push(currentStep);
              previousSteps.push(currentStep);
              this.setState({
                currentStep,
                renderedSteps,
                previousSteps,
                inputValue: this.input.value = null,
                intentName: res.data.intentName,
                chatbotName: res.data.chatbotName,
                userId: res.data.userId,
              });
            } else {
              const step = {
                ...defaultBotSettings,
                message: 'Sorry, I am not understand, please contact our sales.'
              };
        
              currentStep = Object.assign({}, step);
        
              renderedSteps.push(currentStep);
              previousSteps.push(currentStep);
        
              // console.log('currentStep, renderedSteps, previousSteps, inputValue', currentStep, renderedSteps, previousSteps, inputValue)
        
              this.setState(
                {
                  currentStep,
                  renderedSteps,
                  previousSteps,
                  disabled: true
                },
                () => {
                  if (this.input) {
                    this.input.blur();
                  }
                }
              );
            }
          })
          .catch(function (error) {
            console.log(error);
          });
      }
    }
  };

  checkInvalidInput = () => {
    const { enableMobileAutoFocus } = this.props;
    const { currentStep, inputValue } = this.state;
    const result = currentStep.validator(inputValue);
    const value = inputValue;

    if (typeof result !== 'boolean' || !result) {
      this.setState(
        {
          inputValue: result.toString(),
          inputInvalid: true,
          disabled: true
        },
        () => {
          setTimeout(() => {
            this.setState(
              {
                inputValue: value,
                inputInvalid: false,
                disabled: false
              },
              () => {
                if (enableMobileAutoFocus || !isMobile()) {
                  if (this.input) {
                    this.input.focus();
                  }
                }
              }
            );
          }, 2000);
        }
      );

      return true;
    }

    return false;
  };

  toggleChatBot = opened => {
    const { toggleFloating } = this.props;

    if (toggleFloating) {
      toggleFloating({ opened });
    } else {
      this.setState({ opened });
    }
  };

  renderStep = (step, index) => {
    const { renderedSteps } = this.state;
    const {
      avatarStyle,
      bubbleStyle,
      bubbleOptionStyle,
      customStyle,
      hideBotAvatar,
      hideUserAvatar,
      speechSynthesis
    } = this.props;
    const { options, component, asMessage } = step;
    const steps = this.generateRenderedStepsById();
    const previousStep = index > 0 ? renderedSteps[index - 1] : {};

    if (component && !asMessage) {
      return (
        <CustomStep
          key={index}
          speak={this.speak}
          step={step}
          steps={steps}
          style={customStyle}
          previousStep={previousStep}
          previousValue={previousStep.value}
          triggerNextStep={this.triggerNextStep}
        />
      );
    }

    if (options) {
      return (
        <OptionsStep
          key={index}
          step={step}
          previousValue={previousStep.value}
          triggerNextStep={this.triggerNextStep}
          bubbleOptionStyle={bubbleOptionStyle}
        />
      );
    }

    return (
      <TextStep
        key={index}
        step={step}
        steps={steps}
        speak={this.speak}
        previousStep={previousStep}
        previousValue={previousStep.value}
        triggerNextStep={this.triggerNextStep}
        avatarStyle={avatarStyle}
        bubbleStyle={bubbleStyle}
        hideBotAvatar={hideBotAvatar}
        hideUserAvatar={hideUserAvatar}
        speechSynthesis={speechSynthesis}
        isFirst={this.isFirstPosition(step)}
        isLast={this.isLastPosition(step)}
      />
    );
  };

  // Private function
  _triggerCustomComponent = () => {
    const { 
      defaultBotSettings,
      previousSteps,
      renderedSteps,
    } = this.state;

    const currentStep = {
      id: 'review',
      asMessage: true,
      component: (
        <div style={{ width: '100%' }}>
          <h3>Contact Us</h3>
          <h4>Summary</h4>
          <table>
            <tbody>
              {
                previousSteps.map(s => {
                  if (s.param) {
                    return (
                      <tr>
                        <td>{s.param}</td>
                        <td>{s.value}</td>
                      </tr>
                    )
                  }
                })
              }
            </tbody>
          </table>
        </div>
      ),
      ...defaultBotSettings,
    }

    renderedSteps.push(currentStep);
    previousSteps.push(currentStep);

    this.setState({
      currentStep,
      renderedSteps,
      previousSteps,
    });
    
  }

  render() {
    const {
      currentStep,
      disabled,
      inputInvalid,
      inputValue,
      opened,
      renderedSteps,
      speaking,
      recognitionEnable
    } = this.state;
    const {
      className,
      contentStyle,
      extraControl,
      controlStyle,
      floating,
      floatingIcon,
      floatingStyle,
      footerStyle,
      headerComponent,
      headerTitle,
      hideHeader,
      hideSubmitButton,
      inputStyle,
      placeholder,
      inputAttributes,
      recognitionPlaceholder,
      style,
      submitButtonStyle,
      width,
      height,
      token
    } = this.props;

    if (!token) {
      return <div />;
    }

    const header = headerComponent || (
      <Header className="rsc-header">
        <HeaderTitle className="rsc-header-title">{headerTitle}</HeaderTitle>
        {floating && (
          <HeaderIcon className="rsc-header-close-button" onClick={() => this.toggleChatBot(false)}>
            <CloseIcon />
          </HeaderIcon>
        )}
      </Header>
    );

    let customControl;
    if (extraControl !== undefined) {
      customControl = React.cloneElement(extraControl, {
        disabled,
        speaking,
        invalid: inputInvalid
      });
    }

    const icon =
      (this.isInputValueEmpty() || speaking) && recognitionEnable ? <MicIcon /> : <SubmitIcon />;

    const inputPlaceholder = speaking
      ? recognitionPlaceholder
      : currentStep.placeholder || placeholder;

    const inputAttributesOverride = currentStep.inputAttributes || inputAttributes;

    return (
      <div className={`rsc ${className}`}>
        {floating && (
          <FloatButton
            className="rsc-float-button"
            style={floatingStyle}
            opened={opened}
            onClick={() => this.toggleChatBot(true)}
          >
            {typeof floatingIcon === 'string' ? <FloatingIcon src={floatingIcon} /> : floatingIcon}
          </FloatButton>
        )}
        <ChatBotContainer
          className="rsc-container"
          floating={floating}
          floatingStyle={floatingStyle}
          opened={opened}
          style={style}
          width={width}
          height={height}
        >
          {!hideHeader && header}
          <Content
            className="rsc-content"
            ref={this.setContentRef}
            floating={floating}
            style={contentStyle}
            height={height}
            hideInput={currentStep.hideInput}
          >
            {renderedSteps.map(this.renderStep)}
          </Content>
          <Footer className="rsc-footer" style={footerStyle}>
            {!currentStep.hideInput && (
              <Input
                type="textarea"
                style={inputStyle}
                ref={this.setInputRef}
                className="rsc-input"
                placeholder={inputInvalid ? '' : inputPlaceholder}
                onKeyPress={this.handleKeyPress}
                onChange={this.onValueChange}
                value={inputValue}
                floating={floating}
                invalid={inputInvalid}
                // disabled={disabled}
                hasButton={!hideSubmitButton}
                {...inputAttributesOverride}
              />
            )}
            <div style={controlStyle} className="rsc-controls">
              {!currentStep.hideInput && !currentStep.hideExtraControl && customControl}
              {!currentStep.hideInput && !hideSubmitButton && (
                <SubmitButton
                  className="rsc-submit-button"
                  style={submitButtonStyle}
                  onClick={this.handleSubmitButton}
                  invalid={inputInvalid}
                  // disabled={disabled}
                  speaking={speaking}
                >
                  {icon}
                </SubmitButton>
              )}
            </div>
          </Footer>
        </ChatBotContainer>
      </div>
    );
  }
}

ChatBot.propTypes = {
  avatarStyle: PropTypes.objectOf(PropTypes.any),
  botAvatar: PropTypes.string,
  botName: PropTypes.string,
  botDelay: PropTypes.number,
  bubbleOptionStyle: PropTypes.objectOf(PropTypes.any),
  bubbleStyle: PropTypes.objectOf(PropTypes.any),
  cache: PropTypes.bool,
  cacheName: PropTypes.string,
  className: PropTypes.string,
  contentStyle: PropTypes.objectOf(PropTypes.any),
  customDelay: PropTypes.number,
  customStyle: PropTypes.objectOf(PropTypes.any),
  controlStyle: PropTypes.objectOf(PropTypes.any),
  enableMobileAutoFocus: PropTypes.bool,
  enableSmoothScroll: PropTypes.bool,
  extraControl: PropTypes.objectOf(PropTypes.element),
  floating: PropTypes.bool,
  floatingIcon: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  floatingStyle: PropTypes.objectOf(PropTypes.any),
  footerStyle: PropTypes.objectOf(PropTypes.any),
  handleEnd: PropTypes.func,
  headerComponent: PropTypes.element,
  headerTitle: PropTypes.string,
  height: PropTypes.string,
  hideBotAvatar: PropTypes.bool,
  hideHeader: PropTypes.bool,
  hideSubmitButton: PropTypes.bool,
  hideUserAvatar: PropTypes.bool,
  inputAttributes: PropTypes.objectOf(PropTypes.any),
  inputStyle: PropTypes.objectOf(PropTypes.any),
  opened: PropTypes.bool,
  toggleFloating: PropTypes.func,
  placeholder: PropTypes.string,
  recognitionEnable: PropTypes.bool,
  recognitionLang: PropTypes.string,
  recognitionPlaceholder: PropTypes.string,
  speechSynthesis: PropTypes.shape({
    enable: PropTypes.bool,
    lang: PropTypes.string,
    voice:
      typeof window !== 'undefined'
        ? PropTypes.instanceOf(window.SpeechSynthesisVoice)
        : PropTypes.any
  }),
  steps: PropTypes.arrayOf(PropTypes.object).isRequired,
  style: PropTypes.objectOf(PropTypes.any),
  submitButtonStyle: PropTypes.objectOf(PropTypes.any),
  userAvatar: PropTypes.string,
  userDelay: PropTypes.number,
  width: PropTypes.string
};

ChatBot.defaultProps = {
  avatarStyle: {},
  botDelay: 1000,
  botName: 'The bot',
  bubbleOptionStyle: {},
  bubbleStyle: {},
  cache: false,
  cacheName: 'rsc_cache',
  className: '',
  contentStyle: {},
  customStyle: {},
  controlStyle: { position: 'absolute', right: '0', top: '0' },
  customDelay: 1000,
  enableMobileAutoFocus: false,
  enableSmoothScroll: false,
  extraControl: undefined,
  floating: true,
  floatingIcon: <ChatIcon />,
  floatingStyle: {},
  footerStyle: {},
  handleEnd: undefined,
  headerComponent: undefined,
  headerTitle: 'Scope AI Chatbot',
  height: '520px',
  hideBotAvatar: false,
  hideHeader: false,
  hideSubmitButton: false,
  hideUserAvatar: false,
  inputStyle: {},
  opened: undefined,
  placeholder: 'Type the message ...',
  inputAttributes: {},
  recognitionEnable: false,
  recognitionLang: 'en',
  recognitionPlaceholder: 'Listening ...',
  speechSynthesis: {
    enable: false,
    lang: 'en',
    voice: null
  },
  style: {},
  submitButtonStyle: {},
  toggleFloating: undefined,
  userDelay: 0,
  width: '350px',
  botAvatar:
    "data:image/svg+xml,%3csvg version='1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3e%3cpath d='M303 70a47 47 0 1 0-70 40v84h46v-84c14-8 24-23 24-40z' fill='%2393c7ef'/%3e%3cpath d='M256 23v171h23v-84a47 47 0 0 0-23-87z' fill='%235a8bb0'/%3e%3cpath fill='%2393c7ef' d='M0 240h248v124H0z'/%3e%3cpath fill='%235a8bb0' d='M264 240h248v124H264z'/%3e%3cpath fill='%2393c7ef' d='M186 365h140v124H186z'/%3e%3cpath fill='%235a8bb0' d='M256 365h70v124h-70z'/%3e%3cpath fill='%23cce9f9' d='M47 163h419v279H47z'/%3e%3cpath fill='%2393c7ef' d='M256 163h209v279H256z'/%3e%3cpath d='M194 272a31 31 0 0 1-62 0c0-18 14-32 31-32s31 14 31 32z' fill='%233c5d76'/%3e%3cpath d='M380 272a31 31 0 0 1-62 0c0-18 14-32 31-32s31 14 31 32z' fill='%231e2e3b'/%3e%3cpath d='M186 349a70 70 0 1 0 140 0H186z' fill='%233c5d76'/%3e%3cpath d='M256 349v70c39 0 70-31 70-70h-70z' fill='%231e2e3b'/%3e%3c/svg%3e",
  userAvatar:
    "data:image/svg+xml,%3csvg viewBox='-208.5 21 100 100' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3e%3ccircle cx='-158.5' cy='71' fill='%23F5EEE5' r='50'/%3e%3cdefs%3e%3ccircle cx='-158.5' cy='71' id='a' r='50'/%3e%3c/defs%3e%3cclipPath id='b'%3e%3cuse overflow='visible' xlink:href='%23a'/%3e%3c/clipPath%3e%3cpath clip-path='url(%23b)' d='M-108.5 121v-14s-21.2-4.9-28-6.7c-2.5-.7-7-3.3-7-12V82h-30v6.3c0 8.7-4.5 11.3-7 12-6.8 1.9-28.1 7.3-28.1 6.7v14h100.1z' fill='%23E6C19C'/%3e%3cg clip-path='url(%23b)'%3e%3cdefs%3e%3cpath d='M-108.5 121v-14s-21.2-4.9-28-6.7c-2.5-.7-7-3.3-7-12V82h-30v6.3c0 8.7-4.5 11.3-7 12-6.8 1.9-28.1 7.3-28.1 6.7v14h100.1z' id='c'/%3e%3c/defs%3e%3cclipPath id='d'%3e%3cuse overflow='visible' xlink:href='%23c'/%3e%3c/clipPath%3e%3cpath clip-path='url(%23d)' d='M-158.5 100.1c12.7 0 23-18.6 23-34.4 0-16.2-10.3-24.7-23-24.7s-23 8.5-23 24.7c0 15.8 10.3 34.4 23 34.4z' fill='%23D4B08C'/%3e%3c/g%3e%3cpath d='M-158.5 96c12.7 0 23-16.3 23-31 0-15.1-10.3-23-23-23s-23 7.9-23 23c0 14.7 10.3 31 23 31z' fill='%23F2CEA5'/%3e%3c/svg%3e"
};

export default ChatBot;
